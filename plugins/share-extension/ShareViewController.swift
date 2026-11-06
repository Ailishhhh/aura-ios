import UIKit
import UniformTypeIdentifiers

/// "Share → Aura": takes the link shared from YouTube Music, YouTube or Safari and opens it in
/// Aura as aura://open?url=<link>. Nothing is stored; the link travels in the URL.
@objc(ShareViewController)
final class ShareViewController: UIViewController {
  private var handled = false

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .clear
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard !handled else { return }
    handled = true
    findLink { [weak self] link in
      DispatchQueue.main.async {
        guard let self else { return }
        guard let link, let url = Self.auraURL(for: link) else {
          self.fail("There's no link in what you shared.")
          return
        }
        self.openHostApp(url)
      }
    }
  }

  /// The first web link among the shared items, whether shared as a URL or inside text.
  private func findLink(_ done: @escaping (String?) -> Void) {
    let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
    let group = DispatchGroup()
    var urls: [String] = []
    var texts: [String] = []
    let lock = NSLock()
    for provider in providers {
      if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
        group.enter()
        provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
          lock.lock()
          if let url = item as? URL, !url.isFileURL { urls.append(url.absoluteString) }
          else if let string = item as? String { urls.append(string) }
          lock.unlock()
          group.leave()
        }
      } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
        group.enter()
        provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, _ in
          lock.lock()
          if let text = item as? String { texts.append(text) }
          lock.unlock()
          group.leave()
        }
      }
    }
    group.notify(queue: .global()) {
      if let url = urls.first { return done(url) }
      for text in texts {
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let range = NSRange(text.startIndex..., in: text)
        if let match = detector?.firstMatch(in: text, options: [], range: range), let url = match.url {
          return done(url.absoluteString)
        }
      }
      done(nil)
    }
  }

  private static func auraURL(for link: String) -> URL? {
    var allowed = CharacterSet.urlQueryAllowed
    allowed.remove(charactersIn: "&=?+#")
    guard let encoded = link.addingPercentEncoding(withAllowedCharacters: allowed) else { return nil }
    return URL(string: "aura://open?url=\(encoded)")
  }

  /// Extensions can't call UIApplication.shared, but the app object is in the responder chain.
  private func openHostApp(_ url: URL) {
    var responder: UIResponder? = self
    while let current = responder {
      if let application = current as? UIApplication {
        application.open(url, options: [:], completionHandler: nil)
        break
      }
      responder = current.next
    }
    extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
  }

  private func fail(_ message: String) {
    let alert = UIAlertController(title: "Aura", message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak self] _ in
      self?.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    })
    present(alert, animated: true)
  }
}
