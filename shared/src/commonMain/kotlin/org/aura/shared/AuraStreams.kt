package org.aura.shared

import com.metrolist.innertubex.InnerTube
import com.metrolist.innertubex.InnerTubeLogLevel
import com.metrolist.innertubex.InnerTubeLogger
import com.metrolist.innertubex.cipher.PlayerConfigRepository
import com.metrolist.innertubex.cipher.RemotePlayerConfigStore
import com.metrolist.innertubex.cipher.YouTubeCipherService
import com.metrolist.innertubex.extraction.AudioQuality
import com.metrolist.innertubex.extraction.ContentHints
import com.metrolist.innertubex.extraction.ExtractedStream
import com.metrolist.innertubex.extraction.InnerTubeExtractor
import com.metrolist.innertubex.extraction.StreamResolveException
import com.metrolist.innertubex.extraction.YtConfigParser
import com.metrolist.innertubex.extraction.YtConfigParserImpl
import com.metrolist.innertubex.extraction.generateClientPlaybackNonce
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.time.Clock

/** Called once with either a JSON result or a failure message. Swift sees it as a protocol. */
interface ResultCallback {
    fun onResult(
        json: String?,
        failure: String?,
    )
}

/** What the iOS player needs to play one song. Serialized to JSON for JavaScript. */
@Serializable
internal data class StreamInfo(
    val videoId: String,
    val url: String,
    val headers: Map<String, String>,
    val mimeType: String?,
    val codecs: String?,
    val itag: Int,
    val bitrate: Int?,
    val contentLength: Long?,
    val expiresAtMs: Long,
    val loudnessDb: Double?,
    val client: String,
    val requireBoundedRange: Boolean,
    val rangeChunkSize: Long,
    val useRangeChunks: Boolean,
    val title: String?,
    val author: String?,
    val durationSeconds: Long?,
    val thumbnail: String?,
)

/**
 * Stream extraction for iOS, mirroring the Android app's backend/playback/InnerTubeXPlayer.kt.
 * The differences: AVPlayer can't play Opus/WebM, so only AAC in MP4 is accepted, and there is no
 * PoToken provider yet, so InnerTubeX picks clients that don't need one.
 */
class AuraStreams {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val json = Json { encodeDefaults = true }
    private val logger =
        InnerTubeLogger { event ->
            if (event.level >= InnerTubeLogLevel.INFO) {
                println("[AuraShared] ${event.level} ${event.tag}: ${event.message}")
            }
        }
    private val http = createHttpClient()
    private val innerTube = InnerTube(http, logger = logger)
    private val configStore = RemotePlayerConfigStore(http, StoredPlayerConfigRepository, logger)
    private val cipher = YouTubeCipherService(http, configStore, logger)
    private val extractor =
        InnerTubeExtractor(
            configParser = YtConfigParserImpl(http, innerTube, configStore, logger, cipher).withEmbeddedConfigFallback(),
            cipherService = cipher,
            innerTube = innerTube,
            logger = logger,
        )

    private val failuresLock = Mutex()
    private val failures = HashMap<String, FailedClients>()

    /** Signs requests in as the user. Pass nulls to sign out. */
    fun setSession(
        cookie: String?,
        visitorData: String?,
        dataSyncId: String?,
    ) {
        innerTube.replaceSession(
            cookie = cookie,
            visitorData = visitorData,
            dataSyncId = dataSyncId,
            authUser = "0",
            useLoginForBrowse = cookie != null,
        )
    }

    /**
     * Finds a playable URL for [videoId]. [quality] is "high" or "low"; both stay within AAC.
     * [allowBoundedRange] lets InnerTubeX return URLs that only answer bounded byte ranges.
     */
    fun resolve(
        videoId: String,
        quality: String,
        allowBoundedRange: Boolean,
        callback: ResultCallback,
    ) {
        scope.launch {
            val result =
                try {
                    Result.success(resolveNow(videoId, quality, allowBoundedRange))
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Throwable) {
                    Result.failure(error)
                }
            result.fold(
                onSuccess = { callback.onResult(json.encodeToString(StreamInfo.serializer(), it), null) },
                onFailure = { callback.onResult(null, it.describe()) },
            )
        }
    }

    /** A URL from [client] was refused; the next resolve for [videoId] skips that client for a while. */
    fun reportFailure(
        videoId: String,
        client: String,
    ) {
        scope.launch {
            failuresLock.withLock {
                val now = nowMs()
                val old = failures[videoId]?.takeIf { now - it.atMs < FAILURE_TTL_MS }
                failures[videoId] = FailedClients(old?.clients.orEmpty() + client, now)
            }
        }
    }

    /** Downloads and compiles YouTube's player ahead of the first song. */
    fun prewarm() {
        scope.launch { runCatching { extractor.prewarm() } }
    }

    fun close() {
        scope.cancel()
        innerTube.close()
        http.close()
    }

    internal suspend fun resolveNow(
        videoId: String,
        quality: String,
        allowBoundedRange: Boolean,
    ): StreamInfo {
        val excluded =
            failuresLock.withLock {
                failures[videoId]?.takeIf { nowMs() - it.atMs < FAILURE_TTL_MS }?.clients.orEmpty()
            }
        val hints =
            ContentHints().withStreamCapabilities(
                allowHls = false,
                allowSabr = false,
                allowBoundedRange = allowBoundedRange,
            )
        val stream =
            try {
                extractor.extract(
                    videoId = videoId,
                    hints = hints,
                    excludedClients = excluded,
                    audioQuality = if (quality == "low") AudioQuality.LOW else AudioQuality.MP4,
                    clientPlaybackNonce = generateClientPlaybackNonce(),
                )
            } catch (error: StreamResolveException) {
                val cause = error.cause
                throw if (error.reason == StreamResolveException.Reason.NETWORK && cause != null) cause else error
            } ?: error("No playable stream")
        check(stream.sabrBootstrap == null) { "SABR streams can't be played on iOS" }
        check(stream.mimeType?.contains("audio/mp4", ignoreCase = true) == true) {
            "Only ${stream.mimeType ?: "an unknown format"} was offered, which iOS can't play"
        }
        return stream.toInfo()
    }

    private fun ExtractedStream.toInfo(): StreamInfo {
        val metadata = mediaMetadata
        val expires = expiresAt?.toEpochMilliseconds() ?: (nowMs() + DEFAULT_TTL_MS)
        return StreamInfo(
            videoId = videoId,
            url = audioUrl,
            headers = headers,
            mimeType = mimeType,
            codecs = codecs,
            itag = itag,
            bitrate = bitrate,
            contentLength = contentLengthBytes,
            expiresAtMs = expires,
            loudnessDb = loudnessDb,
            client = clientName,
            requireBoundedRange = requireBoundedRange,
            rangeChunkSize = rangeChunkSizeBytes,
            useRangeChunks = useRangeChunks,
            title = metadata?.title,
            author = metadata?.author,
            durationSeconds = metadata?.durationSeconds,
            thumbnail = metadata?.thumbnails?.maxByOrNull { (it.width ?: 0) * (it.height ?: 0) }?.url,
        )
    }

    private fun Throwable.describe(): String =
        when (this) {
            is StreamResolveException -> "${reason.name}: ${message ?: "no details"}"
            else -> "${this::class.simpleName ?: "Error"}: ${message ?: "no details"}"
        }

    private data class FailedClients(
        val clients: Set<String>,
        val atMs: Long,
    )

    private companion object {
        const val FAILURE_TTL_MS = 5 * 60 * 1000L
        const val DEFAULT_TTL_MS = 5 * 60 * 1000L

        fun nowMs(): Long = Clock.System.now().toEpochMilliseconds()
    }
}

/** If the watch page config can't be read, fall back to the embed page, as Android does. */
internal fun YtConfigParser.withEmbeddedConfigFallback(): YtConfigParser =
    object : YtConfigParser by this {
        override suspend fun fetchConfig(
            videoId: String,
            useLoginCookies: Boolean,
        ) = try {
            this@withEmbeddedConfigFallback.fetchConfig(videoId, useLoginCookies)
        } catch (_: IllegalStateException) {
            this@withEmbeddedConfigFallback.fetchEmbeddedConfig(videoId, useLoginCookies = false)
        }
    }

/** Remote player configs (cipher hints) kept between launches, like Android's SharedPreferences copy. */
internal object StoredPlayerConfigRepository : PlayerConfigRepository {
    private const val URL =
        "https://raw.githubusercontent.com/ZemerTeam/zemer-cipher/master/library/src/main/assets/player_configs.json"

    override val enabled: Boolean = true
    override val sourceUrl: String = URL
    override val defaultSourceUrl: String = URL
    override var cachedJson: String
        get() = storeGet("player_config.json").orEmpty()
        set(value) = storeSet("player_config.json", value)
    override var cachedAtMs: Long
        get() = storeGet("player_config.cached_at_ms")?.toLongOrNull() ?: 0L
        set(value) = storeSet("player_config.cached_at_ms", value.toString())
    override var cachedSourceUrl: String
        get() = storeGet("player_config.source_url").orEmpty()
        set(value) = storeSet("player_config.source_url", value)
    override var cachedEtag: String
        get() = storeGet("player_config.etag").orEmpty()
        set(value) = storeSet("player_config.etag", value)
}
