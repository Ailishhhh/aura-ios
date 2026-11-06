pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
        google()
    }
}

dependencyResolutionManagement {
    repositories {
        mavenCentral()
        google()
        maven("https://jitpack.io") {
            content {
                includeGroup("com.github.MetrolistGroup.innertubex")
                includeGroup("com.github.MetrolistGroup.quackjs")
            }
        }
    }
}

rootProject.name = "aura-shared"

// Builds InnerTubeX from a local checkout instead of JitPack: -PinnertubexSource=/path/to/innertubex
providers.gradleProperty("innertubexSource").orNull?.let { path ->
    includeBuild(path) {
        dependencySubstitution {
            substitute(module("com.github.MetrolistGroup.innertubex:innertubex")).using(project(":"))
        }
    }
}
