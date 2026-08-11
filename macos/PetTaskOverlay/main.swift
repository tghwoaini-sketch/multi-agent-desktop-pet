import AppKit
import Foundation

private let codexURL = URL(string: "http://127.0.0.1:43127/tasks")!
private let workBuddyURL = URL(string: "http://127.0.0.1:43128/tasks")!
private let tomSpriteURL = URL(fileURLWithPath: "/Users/Admin/Library/Application Support/OpenPets/pets/tom-lizard/spritesheet.webp")

struct BridgePayload: Decodable {
    let tasks: [PetTask]
}

struct PetTask: Decodable, Hashable {
    let id: String
    let title: String
    let state: String
    let stateNote: String?
    let note: String?

    var detail: String { stateNote ?? note ?? "正在处理" }
    var isCompleted: Bool { state == "已完成" || state == "completed" }
    var isBlocked: Bool { state == "已阻塞" || state == "failed" }
    var isReview: Bool { state == "需要介入" || state == "review" }
}

struct OverlayTask: Hashable {
    let task: PetTask
    let agent: String
    let openURL: URL
}

final class OverlayPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

final class PetTaskStore {
    private var timer: Timer?
    private var seenCodexIDs = Set(UserDefaults.standard.stringArray(forKey: "PetTaskOverlay.seenCodexIDs") ?? [])
    var onChange: (([OverlayTask]) -> Void)?

    func start() {
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 2.5, repeats: true) { [weak self] _ in self?.refresh() }
    }

    deinit { timer?.invalidate() }

    private func fetch(_ url: URL, completion: @escaping ([PetTask]) -> Void) {
        URLSession.shared.dataTask(with: url) { data, _, _ in
            guard let data, let payload = try? JSONDecoder().decode(BridgePayload.self, from: data) else {
                completion([])
                return
            }
            completion(payload.tasks)
        }.resume()
    }

    func refresh() {
        let group = DispatchGroup()
        var codex: [PetTask] = []
        var workBuddy: [PetTask] = []
        group.enter(); fetch(codexURL) { codex = $0; group.leave() }
        group.enter(); fetch(workBuddyURL) { workBuddy = $0; group.leave() }
        group.notify(queue: .main) { [weak self] in
            guard let self else { return }
            for task in codex where !task.isCompleted { self.seenCodexIDs.insert(task.id) }
            UserDefaults.standard.set(Array(self.seenCodexIDs.suffix(80)), forKey: "PetTaskOverlay.seenCodexIDs")

            let codexVisible = codex.filter { !$0.isCompleted || self.seenCodexIDs.contains($0.id) }
            let all = codexVisible.map { OverlayTask(task: $0, agent: "Codex", openURL: URL(string: "http://127.0.0.1:43127/open-task?task=\($0.id)")!) }
                + workBuddy.map { OverlayTask(task: $0, agent: "WorkBuddy", openURL: URL(string: "http://127.0.0.1:43128/open-task?task=\($0.id)")!) }
            let sorted = all.sorted { lhs, rhs in
                if lhs.task.isCompleted != rhs.task.isCompleted { return !lhs.task.isCompleted }
                return lhs.agent < rhs.agent
            }
            self.onChange?(Array(sorted.prefix(5)))
        }
    }
}

final class MiniTomTrackView: NSView {
    private let sprite: NSImage? = NSImage(contentsOf: tomSpriteURL)
    private var spriteFrame = 0
    private var timer: Timer?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        timer = Timer.scheduledTimer(withTimeInterval: 0.13, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.spriteFrame = (self.spriteFrame + 1) % 6
            self.needsDisplay = true
        }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:)") }
    deinit { timer?.invalidate() }

    override func draw(_ dirtyRect: NSRect) {
        let y = bounds.midY
        // This is deliberately an activity runway, not a progress bar. The
        // bridges can observe liveness but cannot truthfully infer completion
        // percentage, so the dots only make the pet's work feel alive.
        let startX: CGFloat = 20
        let dotSpacing: CGFloat = 18
        for index in 0..<12 {
            let x = startX + CGFloat(index) * dotSpacing
            let pulse = (index + spriteFrame) % 6 == 0
            NSColor(calibratedRed: 0.50, green: 0.68, blue: 0.43, alpha: pulse ? 0.85 : 0.38).setFill()
            let size: CGFloat = pulse ? 5.5 : 4
            NSBezierPath(ovalIn: NSRect(x: x - size / 2, y: y - size / 2, width: size, height: size)).fill()
        }
        let runX = startX + 94 + CGFloat(spriteFrame % 2) * 4
        drawTom(at: NSPoint(x: runX, y: y - 15))
        for index in 0..<2 {
            NSColor(calibratedRed: 0.66, green: 0.77, blue: 0.53, alpha: 0.65 - CGFloat(index) * 0.2).setFill()
            NSBezierPath(ovalIn: NSRect(x: runX - 7 - CGFloat(index * 6), y: y - 1 + CGFloat(index * 3), width: 3, height: 3)).fill()
        }
    }

    private func drawTom(at point: NSPoint) {
        guard let sprite, let cg = sprite.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return }
        let frameWidth = cg.width / 8
        let frameHeight = cg.height / 9
        let row = 7
        let rect = CGRect(x: (spriteFrame % 6) * frameWidth, y: cg.height - (row + 1) * frameHeight, width: frameWidth, height: frameHeight)
        guard let crop = cg.cropping(to: rect) else { return }
        NSGraphicsContext.current?.cgContext.draw(crop, in: CGRect(x: point.x, y: point.y, width: 34, height: 37))
    }
}

final class TaskBubbleView: NSView {
    private let overlayTask: OverlayTask
    private let title: NSTextField
    private let detail: NSTextField
    private let action: NSButton

    init(task: OverlayTask) {
        overlayTask = task
        title = NSTextField(labelWithString: "\(task.agent) · \(task.task.title)")
        detail = NSTextField(labelWithString: task.task.isCompleted ? "已完成 · 点击查看结果" : task.task.detail)
        action = NSButton(title: task.task.isCompleted ? "查看并收起" : "打开任务", target: nil, action: nil)
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = 24
        layer?.borderWidth = 1
        layer?.borderColor = NSColor(calibratedRed: 0.83, green: 0.78, blue: 0.68, alpha: 0.78).cgColor
        layer?.backgroundColor = NSColor(calibratedRed: 0.98, green: 0.97, blue: 0.94, alpha: 0.94).cgColor
        layer?.shadowColor = NSColor.black.withAlphaComponent(0.16).cgColor
        layer?.shadowRadius = 14
        layer?.shadowOffset = CGSize(width: 0, height: -3)
        title.font = .systemFont(ofSize: 16, weight: .bold)
        title.textColor = .labelColor
        title.lineBreakMode = .byTruncatingTail
        detail.font = .systemFont(ofSize: 13, weight: .medium)
        detail.textColor = task.task.isCompleted ? NSColor(calibratedRed: 0.12, green: 0.48, blue: 0.23, alpha: 1) : .secondaryLabelColor
        for view in [title, detail] { view.translatesAutoresizingMaskIntoConstraints = false; addSubview(view) }
        action.bezelStyle = .rounded
        action.font = .systemFont(ofSize: 12, weight: .semibold)
        action.target = self
        action.action = #selector(openTask)
        action.translatesAutoresizingMaskIntoConstraints = false
        addSubview(action)
        if task.task.isCompleted {
            action.contentTintColor = NSColor(calibratedRed: 0.12, green: 0.48, blue: 0.23, alpha: 1)
            NSLayoutConstraint.activate([
                title.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20), title.topAnchor.constraint(equalTo: topAnchor, constant: 18), title.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -148),
                detail.leadingAnchor.constraint(equalTo: title.leadingAnchor), detail.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 6),
                action.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -18), action.centerYAnchor.constraint(equalTo: centerYAnchor),
            ])
        } else {
            let track = MiniTomTrackView()
            track.translatesAutoresizingMaskIntoConstraints = false
            addSubview(track)
            NSLayoutConstraint.activate([
                title.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20), title.topAnchor.constraint(equalTo: topAnchor, constant: 16), title.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -120),
                detail.leadingAnchor.constraint(equalTo: title.leadingAnchor), detail.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 5), detail.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -18),
                track.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 18), track.trailingAnchor.constraint(equalTo: action.leadingAnchor, constant: -10), track.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -12), track.heightAnchor.constraint(equalToConstant: 34),
                action.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14), action.centerYAnchor.constraint(equalTo: track.centerYAnchor),
            ])
        }
        setAccessibilityLabel("\(task.agent) 任务：\(task.task.title)")
    }

    required init?(coder: NSCoder) { fatalError("init(coder:)") }

    @objc private func openTask() {
        URLSession.shared.dataTask(with: overlayTask.openURL).resume()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let store = PetTaskStore()
    private var panel: OverlayPanel!

    func applicationDidFinishLaunching(_ notification: Notification) {
        panel = OverlayPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        store.onChange = { [weak self] tasks in self?.render(tasks) }
        store.start()
    }

    private func render(_ tasks: [OverlayTask]) {
        guard let screen = NSScreen.main else { return }
        let width: CGFloat = 490
        let bubbleHeight: CGFloat = 116
        let gap: CGFloat = 12
        let height = max(1, CGFloat(tasks.count) * (bubbleHeight + gap) - gap)
        let frame = NSRect(x: screen.visibleFrame.maxX - width - 22, y: screen.visibleFrame.minY + 170, width: width, height: height)
        let root = NSView(frame: NSRect(origin: .zero, size: frame.size))
        root.wantsLayer = true
        for (index, task) in tasks.enumerated() {
            let bubble = TaskBubbleView(task: task)
            bubble.frame = NSRect(x: 0, y: height - CGFloat(index + 1) * bubbleHeight - CGFloat(index) * gap, width: width, height: bubbleHeight)
            root.addSubview(bubble)
        }
        panel.contentView = root
        panel.setFrame(frame, display: true)
        if tasks.isEmpty { panel.orderOut(nil) } else { panel.orderFrontRegardless() }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
