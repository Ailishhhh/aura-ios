package org.aura.shared

import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.darwin.Darwin
import platform.Foundation.NSUserDefaults

internal actual fun platformHttpClient(configure: HttpClientConfig<*>.() -> Unit): HttpClient =
    HttpClient(Darwin) {
        configure(this)
    }

private const val PREFIX = "aura.shared."

internal actual fun storeGet(key: String): String? = NSUserDefaults.standardUserDefaults.stringForKey(PREFIX + key)

internal actual fun storeSet(
    key: String,
    value: String,
) {
    NSUserDefaults.standardUserDefaults.setObject(value, forKey = PREFIX + key)
}
