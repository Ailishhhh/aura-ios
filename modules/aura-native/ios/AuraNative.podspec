Pod::Spec.new do |s|
  s.name           = 'AuraNative'
  s.version        = '0.1.0'
  s.summary        = 'Aura playback engine and YouTube Music backend'
  s.description    = 'AVFoundation playback with lock-screen controls, and InnerTubeX stream extraction built from Kotlin.'
  s.author         = 'Aura'
  s.homepage       = 'https://tryaura.today'
  s.license        = { :type => 'GPL-3.0' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Built from ../../../shared by scripts/build-shared.sh (CI does this before pod install).
  s.vendored_frameworks = 'Frameworks/AuraShared.xcframework'
  s.frameworks = 'AVFoundation', 'MediaPlayer'
  s.libraries = 'c++'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '*.swift'
end
