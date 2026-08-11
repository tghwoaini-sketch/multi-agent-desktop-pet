import AppKit
import Foundation

@main
final class XiaobuTaskHandoff: NSObject, NSApplicationDelegate {
    private var didHandleURL = false

    static func main() {
        let application = NSApplication.shared
        let delegate = XiaobuTaskHandoff()
        application.delegate = delegate
        application.setActivationPolicy(.accessory)
        application.run()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let commandLineURLs = CommandLine.arguments.dropFirst().compactMap(URL.init(string:))
        handle(commandLineURLs)

        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            guard self?.didHandleURL == false else { return }
            NSApp.terminate(nil)
        }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        handle(urls)
    }

    private func handle(_ urls: [URL]) {
        guard let url = urls.first(where: { $0.scheme == "xiaobu-task" }),
              let agent = url.host,
              let port = ["codex": 43127, "workbuddy": 43128][agent],
              let task = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?
                .first(where: { $0.name == "task" })?
                .value,
              !task.isEmpty,
              var components = URLComponents(string: "http://127.0.0.1:\(port)/open-task")
        else { return }

        didHandleURL = true
        components.queryItems = [URLQueryItem(name: "task", value: task)]
        guard let callbackURL = components.url else {
            NSApp.terminate(nil)
            return
        }

        URLSession.shared.dataTask(with: callbackURL) { _, _, _ in
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }.resume()
    }
}
