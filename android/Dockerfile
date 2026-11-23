# Build image for the Android app (ADR 0010), used by scripts/build-android.sh on the box and in
# CI. Gradle comes with the base image (no wrapper is committed); the Android SDK is pinned here.
FROM gradle:8.14.3-jdk17@sha256:ce50078d456e497bc86b76d386503e84aa45416d85069ad66bc072bf07566b25

ARG CMDLINE_TOOLS=11076708
ARG CMDLINE_TOOLS_SHA256=2d2d50857e4eb553af5a6dc3ad507a17adf43d115264b1afc116f95c92e5e258
ARG ANDROID_PLATFORM=android-35
ARG BUILD_TOOLS=35.0.0

ENV ANDROID_HOME=/opt/android-sdk
ENV PATH=$PATH:/opt/android-sdk/build-tools/$BUILD_TOOLS

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl unzip \
	&& rm -rf /var/lib/apt/lists/* \
	&& curl -fsSLo /tmp/tools.zip \
		"https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS}_latest.zip" \
	&& echo "${CMDLINE_TOOLS_SHA256}  /tmp/tools.zip" | sha256sum -c - \
	&& unzip -q /tmp/tools.zip -d /tmp/tools \
	&& mkdir -p "$ANDROID_HOME/cmdline-tools" \
	&& mv /tmp/tools/cmdline-tools "$ANDROID_HOME/cmdline-tools/latest" \
	&& rm -rf /tmp/tools /tmp/tools.zip \
	&& yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null \
	&& "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --install \
		"platforms;${ANDROID_PLATFORM}" "build-tools;${BUILD_TOOLS}" >/dev/null \
	&& chmod -R a+rX "$ANDROID_HOME"
