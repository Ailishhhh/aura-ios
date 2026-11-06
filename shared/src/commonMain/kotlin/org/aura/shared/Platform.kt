package org.aura.shared

import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.header
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json

/** Darwin on iOS, OkHttp on the JVM. */
internal expect fun platformHttpClient(configure: HttpClientConfig<*>.() -> Unit): HttpClient

/** Small persistent key-value storage: UserDefaults on iOS, memory on the JVM. */
internal expect fun storeGet(key: String): String?

internal expect fun storeSet(
    key: String,
    value: String,
)

/** The same client setup the Android app uses (innertube/InnerTube.kt createClient). */
@OptIn(ExperimentalSerializationApi::class)
internal fun createHttpClient(): HttpClient =
    platformHttpClient {
        // InnerTubeX handles endpoint-specific status validation and transient retries.
        expectSuccess = false
        install(ContentNegotiation) {
            json(
                Json {
                    ignoreUnknownKeys = true
                    explicitNulls = false
                    encodeDefaults = true
                },
            )
        }
        install(HttpTimeout) {
            requestTimeoutMillis = 60_000
            connectTimeoutMillis = 30_000
            socketTimeoutMillis = 60_000
        }
        defaultRequest {
            url("https://music.youtube.com/youtubei/v1/")
            header("Accept", "application/json")
            header("Cache-Control", "no-cache")
        }
    }
