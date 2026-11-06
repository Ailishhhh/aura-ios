package org.aura.shared

import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.seconds

/**
 * Talks to YouTube for real, so it only runs with -Paura.live=true. It proves the same extraction
 * the iOS framework uses can find an AAC stream, before any iOS build is spent on it.
 * runBlocking rather than runTest: virtual time would fire InnerTubeX's timeouts during real I/O.
 */
class AuraStreamsLiveTest {
    private val live = System.getProperty("aura.live") == "true"

    private val songs = listOf("dQw4w9WgXcQ", "kJQP7kiw5Fk", "JGwWNGJdvx8")

    @Test
    fun resolvesAacStreams() {
        if (!live) return
        val streams = AuraStreams()
        val results =
            runBlocking {
                withTimeout(180.seconds) {
                    songs.map { id ->
                        id to runCatching { streams.resolveNow(id, quality = "high", allowBoundedRange = false) }
                    }
                }
            }
        results.forEach { (id, result) ->
            result.fold(
                onSuccess = {
                    println(
                        "LIVE $id ok client=${it.client} itag=${it.itag} mime=${it.mimeType} " +
                            "codecs=${it.codecs} bitrate=${it.bitrate} bounded=${it.requireBoundedRange} " +
                            "chunks=${it.useRangeChunks} headers=${it.headers.keys}",
                    )
                },
                onFailure = { println("LIVE $id failed: ${it::class.simpleName}: ${it.message}") },
            )
        }
        streams.close()
        assertTrue(results.any { it.second.isSuccess }, "No song resolved to an AAC stream")
    }
}
