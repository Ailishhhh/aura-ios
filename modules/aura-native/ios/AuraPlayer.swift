import AVFoundation
import MediaPlayer
import UIKit

/// One song as JavaScript hands it over: where to fetch it and what to show on the lock screen.
struct AuraTrack {
  let id: String
  let url: URL
  let headers: [String: String]
  let title: String
  let artist: String
  let album: String?
  let artwork: URL?
  let duration: Double?

  init?(_ dict: [String: Any]) {
    guard
      let id = dict["id"] as? String,
      let urlString = dict["url"] as? String,
      let url = URL(string: urlString)
    else { return nil }
    self.id = id
    self.url = url
    self.headers = dict["headers"] as? [String: String] ?? [:]
    self.title = dict["title"] as? String ?? ""
    self.artist = dict["artist"] as? String ?? ""
    self.album = dict["album"] as? String
    self.artwork = (dict["artwork"] as? String).flatMap { URL(string: $0) }
    self.duration = (dict["duration"] as? NSNumber)?.doubleValue
  }
}

/// AVQueuePlayer holding the current song and, once JavaScript has resolved it, the next one, so
/// songs change natively even while the app is in the background. The queue itself lives in JS.
/// Every method here runs on the main thread.
final class AuraPlayer: NSObject {
  static let shared = AuraPlayer()

  /// Sends an event to JavaScript: (name, body).
  var emit: ((String, [String: Any]) -> Void)?

  private let player = AVQueuePlayer()
  private var tracks: [ObjectIdentifier: AuraTrack] = [:]
  private var itemObservations: [ObjectIdentifier: NSKeyValueObservation] = [:]
  private var observations: [NSKeyValueObservation] = []
  private var timeObserver: Any?
  private var currentItem: AVPlayerItem?
  private var nextItem: AVPlayerItem?
  private var artworkTask: URLSessionDataTask?
  private var commandsInstalled = false
  /// Whether the listener wants music playing. Survives interruptions such as phone calls.
  private var intendsToPlay = false
  private var rate: Float = 1

  private override init() {
    super.init()
    player.actionAtItemEnd = .advance
    try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])

    observations.append(
      player.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
        DispatchQueue.main.async {
          self?.refreshNowPlayingTime()
          self?.emitState()
        }
      })
    observations.append(
      player.observe(\.currentItem, options: [.new]) { [weak self] _, _ in
        DispatchQueue.main.async { self?.currentItemChanged() }
      })
    timeObserver = player.addPeriodicTimeObserver(
      forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main
    ) { [weak self] _ in
      self?.emitState()
    }

    let center = NotificationCenter.default
    center.addObserver(
      self, selector: #selector(itemEnded(_:)), name: .AVPlayerItemDidPlayToEndTime, object: nil)
    center.addObserver(
      self, selector: #selector(itemFailedToEnd(_:)), name: .AVPlayerItemFailedToPlayToEndTime,
      object: nil)
    center.addObserver(
      self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification,
      object: AVAudioSession.sharedInstance())
    center.addObserver(
      self, selector: #selector(routeChanged(_:)), name: AVAudioSession.routeChangeNotification,
      object: AVAudioSession.sharedInstance())
  }

  // MARK: Commands from JavaScript

  /// Replaces whatever is playing with [track].
  func load(_ track: AuraTrack, startAt: Double, autoplay: Bool) {
    installRemoteCommands()
    player.removeAllItems()
    forgetAll()
    let item = makeItem(track)
    currentItem = item
    nextItem = nil
    player.insert(item, after: nil)
    if startAt > 0 {
      player.seek(to: CMTime(seconds: startAt, preferredTimescale: 1000))
    }
    updateNowPlaying(track)
    if autoplay { play() } else { emitState() }
  }

  /// The song to move on to when the current one ends; nil clears it.
  func setNext(_ track: AuraTrack?) {
    if let old = nextItem {
      player.remove(old)
      forget(old)
      nextItem = nil
    }
    guard let track else { return }
    let item = makeItem(track)
    nextItem = item
    player.insert(item, after: player.currentItem)
  }

  func play() {
    intendsToPlay = true
    activateSession()
    player.play()
  }

  func pause() {
    intendsToPlay = false
    player.pause()
  }

  func seek(to seconds: Double) {
    let time = CMTime(seconds: max(0, seconds), preferredTimescale: 1000)
    player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
      DispatchQueue.main.async {
        self?.refreshNowPlayingTime()
        self?.emitState()
      }
    }
  }

  func stop() {
    intendsToPlay = false
    player.pause()
    player.removeAllItems()
    forgetAll()
    currentItem = nil
    nextItem = nil
    artworkTask?.cancel()
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    emitState()
  }

  func setVolume(_ volume: Double) {
    player.volume = Float(min(1, max(0, volume)))
  }

  func setRate(_ value: Double) {
    rate = Float(min(3, max(0.25, value)))
    player.defaultRate = rate
    if player.timeControlStatus != .paused { player.rate = rate }
    refreshNowPlayingTime()
  }

  func snapshot() -> [String: Any] {
    var body: [String: Any] = [:]
    let state: String
    switch player.timeControlStatus {
    case .playing: state = "playing"
    case .waitingToPlayAtSpecifiedRate: state = "loading"
    default: state = player.currentItem == nil ? "idle" : "paused"
    }
    body["state"] = state
    body["intendsToPlay"] = intendsToPlay
    if let id = currentItem.flatMap({ tracks[ObjectIdentifier($0)]?.id }) { body["id"] = id }
    let position = player.currentTime().seconds
    body["position"] = position.isFinite ? position : 0
    if let duration = player.currentItem?.duration.seconds, duration.isFinite, duration > 0 {
      body["duration"] = duration
    }
    if let end = player.currentItem?.loadedTimeRanges.last?.timeRangeValue.end.seconds, end.isFinite {
      body["buffered"] = end
    }
    return body
  }

  // MARK: Items

  private func makeItem(_ track: AuraTrack) -> AVPlayerItem {
    var options: [String: Any] = [:]
    if !track.headers.isEmpty && !track.url.isFileURL {
      options["AVURLAssetHTTPHeaderFieldsKey"] = track.headers
    }
    let asset = AVURLAsset(url: track.url, options: options)
    let item = AVPlayerItem(asset: asset)
    let key = ObjectIdentifier(item)
    tracks[key] = track
    itemObservations[key] = item.observe(\.status, options: [.new]) { [weak self] item, _ in
      guard item.status == .failed else { return }
      DispatchQueue.main.async { self?.reportFailure(of: item, error: item.error) }
    }
    return item
  }

  private func forget(_ item: AVPlayerItem) {
    let key = ObjectIdentifier(item)
    itemObservations[key]?.invalidate()
    itemObservations[key] = nil
    tracks[key] = nil
  }

  private func forgetAll() {
    itemObservations.values.forEach { $0.invalidate() }
    itemObservations.removeAll()
    tracks.removeAll()
  }

  private func currentItemChanged() {
    guard let item = player.currentItem, item !== currentItem else { return }
    guard let track = tracks[ObjectIdentifier(item)] else { return }
    if let finished = currentItem { forget(finished) }
    currentItem = item
    if item === nextItem { nextItem = nil }
    updateNowPlaying(track)
    emit?("onTrackChanged", ["id": track.id])
    emitState()
  }

  @objc private func itemEnded(_ note: Notification) {
    DispatchQueue.main.async { [weak self] in
      guard let self, let item = note.object as? AVPlayerItem, item === self.currentItem else { return }
      // With a next song queued, AVQueuePlayer moves on by itself and onTrackChanged follows.
      if self.nextItem == nil, let track = self.tracks[ObjectIdentifier(item)] {
        self.emit?("onTrackEnded", ["id": track.id])
      }
    }
  }

  @objc private func itemFailedToEnd(_ note: Notification) {
    let error = note.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error
    DispatchQueue.main.async { [weak self] in
      guard let item = note.object as? AVPlayerItem else { return }
      self?.reportFailure(of: item, error: error)
    }
  }

  private func reportFailure(of item: AVPlayerItem, error: Error?) {
    guard let track = tracks[ObjectIdentifier(item)] else { return }
    var body: [String: Any] = [
      "id": track.id,
      "current": item === currentItem,
      "message": error?.localizedDescription ?? "Playback failed",
    ]
    if let error = error as NSError? {
      body["domain"] = error.domain
      body["code"] = error.code
      if let underlying = error.userInfo[NSUnderlyingErrorKey] as? NSError {
        body["underlying"] = "\(underlying.domain) \(underlying.code)"
      }
    }
    if let event = item.errorLog()?.events.last {
      body["httpStatus"] = event.errorStatusCode
      if let comment = event.errorComment { body["comment"] = comment }
    }
    if item === nextItem { nextItem = nil }
    emit?("onPlayerError", body)
  }

  // MARK: Audio session

  private func activateSession() {
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playback, mode: .default, options: [])
      try session.setActive(true)
    } catch {
      emit?("onPlayerError", ["message": "Audio session: \(error.localizedDescription)", "current": true])
    }
  }

  @objc private func interrupted(_ note: Notification) {
    guard
      let info = note.userInfo,
      let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
      let type = AVAudioSession.InterruptionType(rawValue: raw)
    else { return }
    let options = AVAudioSession.InterruptionOptions(
      rawValue: info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0)
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      if type == .ended, options.contains(.shouldResume), self.intendsToPlay {
        self.play()
      }
      self.emitState()
    }
  }

  @objc private func routeChanged(_ note: Notification) {
    guard
      let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
      let reason = AVAudioSession.RouteChangeReason(rawValue: raw)
    else { return }
    // Headphones pulled out: AVPlayer pauses itself, and the music shouldn't come back on its own.
    if reason == .oldDeviceUnavailable {
      DispatchQueue.main.async { [weak self] in
        self?.intendsToPlay = false
        self?.emitState()
      }
    }
  }

  // MARK: Lock screen

  private func installRemoteCommands() {
    guard !commandsInstalled else { return }
    commandsInstalled = true
    let center = MPRemoteCommandCenter.shared()
    center.playCommand.addTarget { [weak self] _ in
      self?.play()
      self?.emit?("onRemoteCommand", ["command": "play"])
      return .success
    }
    center.pauseCommand.addTarget { [weak self] _ in
      self?.pause()
      self?.emit?("onRemoteCommand", ["command": "pause"])
      return .success
    }
    center.togglePlayPauseCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }
      if self.player.timeControlStatus == .paused { self.play() } else { self.pause() }
      self.emit?("onRemoteCommand", ["command": "toggle"])
      return .success
    }
    center.nextTrackCommand.addTarget { [weak self] _ in
      self?.emit?("onRemoteCommand", ["command": "next"])
      return .success
    }
    center.previousTrackCommand.addTarget { [weak self] _ in
      self?.emit?("onRemoteCommand", ["command": "previous"])
      return .success
    }
    center.changePlaybackPositionCommand.addTarget { [weak self] event in
      guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
      self?.seek(to: event.positionTime)
      self?.emit?("onRemoteCommand", ["command": "seek", "position": event.positionTime])
      return .success
    }
    center.nextTrackCommand.isEnabled = true
    center.previousTrackCommand.isEnabled = true
    center.skipForwardCommand.isEnabled = false
    center.skipBackwardCommand.isEnabled = false
  }

  private func updateNowPlaying(_ track: AuraTrack) {
    var info: [String: Any] = [
      MPMediaItemPropertyTitle: track.title,
      MPMediaItemPropertyArtist: track.artist,
      MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: 0.0,
      MPNowPlayingInfoPropertyPlaybackRate: 0.0,
    ]
    if let album = track.album { info[MPMediaItemPropertyAlbumTitle] = album }
    if let duration = track.duration { info[MPMediaItemPropertyPlaybackDuration] = duration }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    loadArtwork(for: track)
  }

  private func refreshNowPlayingTime() {
    guard var info = MPNowPlayingInfoCenter.default().nowPlayingInfo else { return }
    let position = player.currentTime().seconds
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = position.isFinite ? position : 0
    info[MPNowPlayingInfoPropertyPlaybackRate] =
      player.timeControlStatus == .playing ? Double(player.rate) : 0.0
    if let duration = player.currentItem?.duration.seconds, duration.isFinite, duration > 0 {
      info[MPMediaItemPropertyPlaybackDuration] = duration
    }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }

  private func loadArtwork(for track: AuraTrack) {
    artworkTask?.cancel()
    guard let url = track.artwork else { return }
    let id = track.id
    artworkTask = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
      guard let data, let image = UIImage(data: data) else { return }
      let artwork = AuraPlayer.makeArtwork(image)
      DispatchQueue.main.async {
        guard
          let self,
          let item = self.currentItem,
          self.tracks[ObjectIdentifier(item)]?.id == id,
          var info = MPNowPlayingInfoCenter.default().nowPlayingInfo
        else { return }
        info[MPMediaItemPropertyArtwork] = artwork
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
      }
    }
    artworkTask?.resume()
  }

  /// Kept out of any actor: iOS calls the artwork handler on a background queue.
  private static func makeArtwork(_ image: UIImage) -> MPMediaItemArtwork {
    MPMediaItemArtwork(boundsSize: image.size) { _ in image }
  }

  private func emitState() {
    emit?("onPlayerState", snapshot())
  }
}
