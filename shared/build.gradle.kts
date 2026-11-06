import org.jetbrains.kotlin.gradle.plugin.mpp.apple.XCFramework

plugins {
    kotlin("multiplatform") version "2.4.21"
    kotlin("plugin.serialization") version "2.4.21"
}

val innertubex = "v0.11.5"
val ktor = "3.6.0"

kotlin {
    jvmToolchain(21)

    // The JVM target exists so the extraction can be tested on Linux CI.
    jvm()

    val xcframework = XCFramework("AuraShared")
    listOf(iosArm64(), iosSimulatorArm64()).forEach { target ->
        target.binaries.framework {
            baseName = "AuraShared"
            isStatic = true
            binaryOption("bundleId", "org.aura.shared")
            xcframework.add(this)
        }
    }

    sourceSets {
        commonMain.dependencies {
            implementation("com.github.MetrolistGroup.innertubex:innertubex:$innertubex")
            implementation("io.ktor:ktor-client-core:$ktor")
            implementation("io.ktor:ktor-client-content-negotiation:$ktor")
            implementation("io.ktor:ktor-serialization-kotlinx-json:$ktor")
            implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.12.0")
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")
        }
        iosMain.dependencies {
            implementation("io.ktor:ktor-client-darwin:$ktor")
        }
        jvmMain.dependencies {
            implementation("io.ktor:ktor-client-okhttp:$ktor")
        }
        jvmTest.dependencies {
            implementation(kotlin("test"))
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.11.0")
        }
    }
}

tasks.withType<Test>().configureEach {
    // Live tests talk to YouTube; CI turns them on with -Paura.live=true.
    systemProperty("aura.live", providers.gradleProperty("aura.live").getOrElse("false"))
    testLogging {
        events("passed", "failed", "skipped", "standardOut", "standardError")
        showStandardStreams = true
    }
}
