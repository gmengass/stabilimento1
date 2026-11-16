// Android wrapper for club tablets (ADR 0010). Built by scripts/build-android.sh, never by hand
// on the box: the script supplies the club's origins, root certificate and version code.
pluginManagement {
    repositories {
        google()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "stabilimento-tablet"
include(":app")
