package org.aura.shared

import com.metrolist.innertubex.extraction.StreamResolveException
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.seconds

/**
 * Talks to YouTube for real, so it only runs with -Paura.live=true. It proves the same extraction
 * the iOS framework uses finds AAC streams for ordinary songs, before an iOS build is spent on it.
 * runBlocking rather than runTest: virtual time would fire InnerTubeX's timeouts during real I/O.
 */
class AuraStreamsLiveTest {
    private val live = System.getProperty("aura.live") == "true"

    // A mix: an official video, two big music videos, remastered album tracks, a recent single.
    private val songs =
        listOf("dQw4w9WgXcQ", "kJQP7kiw5Fk", "JGwWNGJdvx8", "yPYZpwSpKmA", "fJ9rUzIMcZQ", "4NRXx6U8ABQ", "lYBUbBu4W08")

    @Test
    fun resolvesAacStreams() {
        if (!live) return
        val streams = AuraStreams()
        val results =
            runBlocking {
                withTimeout(300.seconds) {
                    songs.map { id ->
                        id to runCatching { streams.resolveNow(id, quality = "high", allowBoundedRange = true) }
                    }
                }
            }
        results.forEach { (id, result) ->
            result.fold(
                onSuccess = {
                    println(
                        "LIVE $id ok client=${it.client} itag=${it.itag} mime=${it.mimeType} " +
                            "bitrate=${it.bitrate} bounded=${it.requireBoundedRange} chunks=${it.useRangeChunks} " +
                            "chunk=${it.rangeChunkSize} length=${it.contentLength} headers=${it.headers.keys}",
                    )
                },
                onFailure = { error ->
                    println("LIVE $id failed: ${error::class.simpleName}: ${error.message}")
                    (error as? StreamResolveException)?.diagnostics?.attempts?.forEach { attempt ->
                        println("LIVE   tried ${attempt.clientName}/${attempt.profileId}: ${attempt.outcome}")
                    }
                },
            )
        }
        val ok = results.count { it.second.isSuccess }
        println("LIVE resolved $ok of ${songs.size}")
        streams.close()
        assertTrue(ok * 2 >= songs.size, "Fewer than half of the songs resolved to an AAC stream")
    }
}
