# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ---- Capacitor / Cordova keep rules ----
# Capacitor and Cordova plugins are resolved by class name via reflection,
# so R8 must not rename or remove them.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep class org.apache.cordova.** { *; }
-keep public class * extends org.apache.cordova.CordovaPlugin { *; }

# Keep @JavascriptInterface methods exposed to the WebView bridge.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# AndroidX WebKit
-keep class androidx.webkit.** { *; }

# Keep annotations / generic signatures used by the bridge.
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod
