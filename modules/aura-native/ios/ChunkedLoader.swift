import AVFoundation

/// Feeds AVPlayer a stream in bounded byte ranges, for YouTube clients whose URLs refuse
/// open-ended requests (InnerTubeX's requireBoundedRange / useRangeChunks). The Android app does
/// the same in playback/StreamDataSource.kt; AVPlayer can only be made to do it through a resource
/// loader on a custom URL scheme.
final class ChunkedLoader: NSObject, AVAssetResourceLoaderDelegate {
  static let scheme = "aurachunk"

  let queue = DispatchQueue(label: "org.aura.chunked")
  private let source: URL
  private let headers: [String: String]
  private let chunkSize: Int64
  private var contentLength: Int64?
  private let contentType: String
  private let session: URLSession
  private var jobs: [ObjectIdentifier: Job] = [:]

  init(source: URL, headers: [String: String], chunkSize: Int64, contentLength: Int64?, mimeType: String?) {
    self.source = source
    self.headers = headers
    self.chunkSize = max(64 * 1024, chunkSize)
    self.contentLength = contentLength.flatMap { $0 > 0 ? $0 : nil }
    self.contentType = (mimeType ?? "audio/mp4").contains("mp4") ? AVFileType.m4a.rawValue : AVFileType.mp4.rawValue
    let config = URLSessionConfiguration.default
    config.timeoutIntervalForRequest = 15
    config.httpMaximumConnectionsPerHost = 4
    self.session = URLSession(configuration: config)
    super.init()
  }

  deinit {
    session.invalidateAndCancel()
  }

  /// The URL AVURLAsset is given: the real one with our scheme, so AVPlayer asks us for bytes.
  var assetURL: URL {
    var components = URLComponents(url: source, resolvingAgainstBaseURL: false)!
    components.scheme = Self.scheme
    return components.url!
  }

  // MARK: AVAssetResourceLoaderDelegate (called on `queue`)

  func resourceLoader(
    _ resourceLoader: AVAssetResourceLoader,
    shouldWaitForLoadingOfRequestedResource loadingRequest: AVAssetResourceLoadingRequest
  ) -> Bool {
    let job = Job(request: loadingRequest)
    jobs[ObjectIdentifier(loadingRequest)] = job
    withLength { [weak self] length, error in
      guard let self, !job.cancelled else { return }
      if let error {
        self.finish(job, error: error)
        return
      }
      guard let length else {
        self.finish(job, error: Self.error(-1, "The stream didn't say how long it is"))
        return
      }
      if let info = loadingRequest.contentInformationRequest {
        info.contentType = self.contentType
        info.contentLength = length
        info.isByteRangeAccessSupported = true
      }
      guard let data = loadingRequest.dataRequest else {
        self.finish(job, error: nil)
        return
      }
      let start = data.requestedOffset
      let end =
        data.requestsAllDataToEndOfResource
        ? length - 1
        : min(length - 1, data.requestedOffset + Int64(data.requestedLength) - 1)
      self.fetch(job, from: max(start, data.currentOffset), to: end)
    }
    return true
  }

  func resourceLoader(_ resourceLoader: AVAssetResourceLoader, didCancel loadingRequest: AVAssetResourceLoadingRequest) {
    if let job = jobs.removeValue(forKey: ObjectIdentifier(loadingRequest)) {
      job.cancelled = true
      job.task?.cancel()
    }
  }

  // MARK: Fetching

  /// The stream's total size: known from InnerTubeX, or asked for with a one-byte range.
  private func withLength(_ done: @escaping (Int64?, Error?) -> Void) {
    if let contentLength {
      done(contentLength, nil)
      return
    }
    var request = makeRequest(range: "bytes=0-0")
    request.httpMethod = "GET"
    session.dataTask(with: request) { [weak self] _, response, error in
      guard let self else { return }
      self.queue.async {
        if let error { return done(nil, error) }
        let http = response as? HTTPURLResponse
        guard let http, http.statusCode == 206 || http.statusCode == 200 else {
          return done(nil, Self.error(http?.statusCode ?? -1, "The stream refused the request"))
        }
        let total =
          (http.value(forHTTPHeaderField: "Content-Range") ?? "")
          .split(separator: "/").last.flatMap { Int64($0) }
          ?? (http.statusCode == 200 ? http.expectedContentLength : nil)
        self.contentLength = total
        done(total, nil)
      }
    }.resume()
  }

  private func fetch(_ job: Job, from start: Int64, to end: Int64) {
    guard !job.cancelled else { return }
    if start > end {
      finish(job, error: nil)
      return
    }
    let stop = min(end, start + chunkSize - 1)
    let request = makeRequest(range: "bytes=\(start)-\(stop)")
    let task = session.dataTask(with: request) { [weak self] data, response, error in
      guard let self else { return }
      self.queue.async {
        guard !job.cancelled else { return }
        if let error {
          self.finish(job, error: error)
          return
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? -1
        guard status == 206 || status == 200, let data, !data.isEmpty else {
          self.finish(job, error: Self.error(status, "The stream answered \(status)"))
          return
        }
        // A server that ignores Range sends everything from 0; keep only the part asked for.
        var chunk = data
        if status == 200 && start > 0 {
          guard Int64(data.count) > start else {
            self.finish(job, error: Self.error(status, "The stream ignored the byte range"))
            return
          }
          chunk = data.subdata(in: Int(start)..<min(data.count, Int(stop) + 1))
        }
        job.request.dataRequest?.respond(with: chunk)
        let next = start + Int64(chunk.count)
        if next > end {
          self.finish(job, error: nil)
        } else {
          self.fetch(job, from: next, to: end)
        }
      }
    }
    job.task = task
    task.resume()
  }

  private func makeRequest(range: String) -> URLRequest {
    var request = URLRequest(url: source)
    for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
    request.setValue(range, forHTTPHeaderField: "Range")
    request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
    return request
  }

  private func finish(_ job: Job, error: Error?) {
    jobs[ObjectIdentifier(job.request)] = nil
    guard !job.request.isFinished, !job.request.isCancelled else { return }
    if let error { job.request.finishLoading(with: error) } else { job.request.finishLoading() }
  }

  private static func error(_ status: Int, _ message: String) -> NSError {
    NSError(domain: "AuraChunkedStream", code: status, userInfo: [NSLocalizedDescriptionKey: message, "httpStatus": status])
  }

  private final class Job {
    let request: AVAssetResourceLoadingRequest
    var task: URLSessionDataTask?
    var cancelled = false
    init(request: AVAssetResourceLoadingRequest) { self.request = request }
  }
}
