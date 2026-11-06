import AuraShared
import ExpoModulesCore

public class AuraNativeModule: Module {
  private lazy var streams = AuraStreams()

  public func definition() -> ModuleDefinition {
    Name("AuraNative")

    Events("onPlayerState", "onTrackChanged", "onTrackEnded", "onPlayerError", "onRemoteCommand")

    OnCreate {
      AuraPlayer.shared.emit = { [weak self] name, body in
        self?.sendEvent(name, body)
      }
    }

    OnDestroy {
      AuraPlayer.shared.emit = nil
    }

    // MARK: YouTube Music backend (Kotlin, InnerTubeX)

    AsyncFunction("resolveStream") {
      (videoId: String, quality: String, allowBoundedRange: Bool, promise: Promise) in
      self.streams.resolve(
        videoId: videoId, quality: quality, allowBoundedRange: allowBoundedRange,
        callback: PromiseCallback(promise))
    }

    Function("reportStreamFailure") { (videoId: String, client: String) in
      self.streams.reportFailure(videoId: videoId, client: client)
    }

    Function("setSession") { (cookie: String?, visitorData: String?, dataSyncId: String?) in
      self.streams.setSession(cookie: cookie, visitorData: visitorData, dataSyncId: dataSyncId)
    }

    Function("prewarm") {
      self.streams.prewarm()
    }

    // MARK: Player

    AsyncFunction("load") { (track: [String: Any], startAt: Double, autoplay: Bool) in
      guard let parsed = AuraTrack(track) else { throw InvalidTrackException() }
      AuraPlayer.shared.load(parsed, startAt: startAt, autoplay: autoplay)
    }.runOnQueue(.main)

    AsyncFunction("setNext") { (track: [String: Any]?) in
      guard let track else {
        AuraPlayer.shared.setNext(nil)
        return
      }
      guard let parsed = AuraTrack(track) else { throw InvalidTrackException() }
      AuraPlayer.shared.setNext(parsed)
    }.runOnQueue(.main)

    AsyncFunction("play") {
      AuraPlayer.shared.play()
    }.runOnQueue(.main)

    AsyncFunction("pause") {
      AuraPlayer.shared.pause()
    }.runOnQueue(.main)

    AsyncFunction("seek") { (seconds: Double) in
      AuraPlayer.shared.seek(to: seconds)
    }.runOnQueue(.main)

    AsyncFunction("stop") {
      AuraPlayer.shared.stop()
    }.runOnQueue(.main)

    AsyncFunction("setVolume") { (volume: Double) in
      AuraPlayer.shared.setVolume(volume)
    }.runOnQueue(.main)

    AsyncFunction("setRate") { (rate: Double) in
      AuraPlayer.shared.setRate(rate)
    }.runOnQueue(.main)

    AsyncFunction("getState") { () -> [String: Any] in
      AuraPlayer.shared.snapshot()
    }.runOnQueue(.main)

    // MARK: Diagnostics

    /// Writes a file into Documents, where CI reads it back from the simulator.
    AsyncFunction("writeDiagnostics") { (name: String, contents: String) in
      let safe = name.replacingOccurrences(of: "/", with: "_")
      let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      try contents.write(to: folder.appendingPathComponent(safe), atomically: true, encoding: .utf8)
    }
  }
}

/// Bridges InnerTubeX's one-shot Kotlin callback to an Expo promise.
final class PromiseCallback: NSObject, ResultCallback {
  private let promise: Promise

  init(_ promise: Promise) {
    self.promise = promise
  }

  func onResult(json: String?, failure: String?) {
    if let json {
      promise.resolve(json)
    } else {
      promise.reject("ERR_STREAM", failure ?? "No playable stream")
    }
  }
}

final class InvalidTrackException: Exception {
  override var reason: String {
    "A track needs at least an id and a url"
  }
}
