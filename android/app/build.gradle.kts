import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Set by scripts/build-android.sh from .env (ADR 0010, ADR 0011). OriginPolicy checks them
// again at launch; this check stops a bad value from ever reaching an APK.
val origin = Regex("""https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?""")
fun clubValue(name: String): String = providers.gradleProperty(name).orNull?.trim().orEmpty()
val appUrl = clubValue("appUrl")
val trustedOrigins = clubValue("trustedOrigins")
val remoteUrl = clubValue("remoteUrl")
val clubRoot = file("src/main/res/raw/club_root.crt")

fun javaString(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

val verifyClubConfig by tasks.registering {
    doLast {
        require(origin.matches(appUrl)) { "appUrl must be an https origin, got '$appUrl'" }
        val listed = trustedOrigins.split(',').map { it.trim() }.filter { it.isNotEmpty() }
        listed.forEach { require(origin.matches(it)) { "trustedOrigins: '$it' is not an https origin" } }
        require(remoteUrl.isEmpty() || origin.matches(remoteUrl)) {
            "remoteUrl must be empty or an https origin, got '$remoteUrl'"
        }
        require(clubRoot.isFile) { "missing $clubRoot: build with scripts/build-android.sh" }
    }
}
tasks.named("preBuild") { dependsOn(verifyClubConfig) }

android {
    namespace = "app.stabilimento.tablet"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "app.stabilimento.tablet"
        minSdk = 24
        targetSdk = 35
        versionCode = clubValue("versionCode").ifEmpty { "1" }.toInt()
        versionName = clubValue("versionName").ifEmpty { "dev" }
        buildConfigField("String", "APP_URL", javaString(appUrl))
        buildConfigField("String", "TRUSTED_ORIGINS", javaString(trustedOrigins))
        buildConfigField("String", "REMOTE_URL", javaString(remoteUrl))
    }

    buildFeatures { buildConfig = true }

    buildTypes {
        release { isMinifyEnabled = false }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
