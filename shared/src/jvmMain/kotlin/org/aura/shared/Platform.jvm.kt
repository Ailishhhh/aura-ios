package org.aura.shared

import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.okhttp.OkHttp
import java.util.concurrent.ConcurrentHashMap

internal actual fun platformHttpClient(configure: HttpClientConfig<*>.() -> Unit): HttpClient =
    HttpClient(OkHttp) {
        configure(this)
    }

private val memory = ConcurrentHashMap<String, String>()

internal actual fun storeGet(key: String): String? = memory[key]

internal actual fun storeSet(
    key: String,
    value: String,
) {
    memory[key] = value
}
