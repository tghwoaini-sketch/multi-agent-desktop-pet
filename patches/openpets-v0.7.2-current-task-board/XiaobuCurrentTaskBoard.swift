import AppKit
import Combine
import SwiftUI

@MainActor
final class XiaobuTaskBoardPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

@MainActor
final class XiaobuCurrentTaskBoardModel: ObservableObject {
    struct Item: Identifiable, Codable, Equatable {
        var id: UUID
        var title: String
        var completed: Bool
    }

    private static let storageKey = "xiaobu.current-task-board.v1"
    private static let maximumItemCount = 5

    @Published private(set) var items: [Item]
    @Published var isExpanded = false {
        didSet { notifyLayoutChanged() }
    }

    var onLayoutChanged: (() -> Void)?

    init() {
        if
            let data = UserDefaults.standard.data(forKey: Self.storageKey),
            let saved = try? JSONDecoder().decode([Item].self, from: data)
        {
            items = Array(saved.prefix(Self.maximumItemCount))
        } else {
            items = []
        }
    }

    var activeCount: Int { items.filter { !$0.completed }.count }

    var preferredSize: CGSize {
        guard isExpanded else { return CGSize(width: 44, height: 44) }
        return CGSize(width: 300, height: max(128, 102 + CGFloat(items.count) * 46))
    }

    func addItem() {
        guard items.count < Self.maximumItemCount else { return }
        items.append(Item(id: UUID(), title: "新的当前事项", completed: false))
        save()
    }

    func titleBinding(for id: UUID) -> Binding<String> {
        Binding(
            get: { [weak self] in self?.items.first(where: { $0.id == id })?.title ?? "" },
            set: { [weak self] title in
                guard let self, let index = self.items.firstIndex(where: { $0.id == id }) else { return }
                self.items[index].title = String(title.prefix(72))
                self.save()
            }
        )
    }

    func toggleCompletion(for id: UUID) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        items[index].completed.toggle()
        items.sort { lhs, rhs in lhs.completed == rhs.completed ? false : !lhs.completed && rhs.completed }
        save()
    }

    func deleteItem(id: UUID) {
        items.removeAll { $0.id == id }
        save()
    }

    private func save() {
        if let data = try? JSONEncoder().encode(items) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        }
        notifyLayoutChanged()
    }

    private func notifyLayoutChanged() {
        DispatchQueue.main.async { [weak self] in self?.onLayoutChanged?() }
    }
}

@MainActor
struct XiaobuCurrentTaskBoardView: View {
    @ObservedObject var model: XiaobuCurrentTaskBoardModel

    var body: some View {
        Group {
            if model.isExpanded { expandedBoard } else { collapsedHandle }
        }
        .frame(width: model.preferredSize.width, height: model.preferredSize.height)
    }

    private var collapsedHandle: some View {
        Button { model.isExpanded = true } label: {
            ZStack {
                Circle().fill(.ultraThinMaterial)
                Circle().stroke(Color.secondary.opacity(0.23), lineWidth: 1)
                Text("\(model.activeCount)")
                    .font(.system(size: 17, weight: .semibold, design: .rounded))
                    .monospacedDigit()
            }
            .shadow(color: .black.opacity(0.11), radius: 7, x: 0, y: 2)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("查看当前事项")
        .accessibilityValue("\(model.activeCount) 项进行中")
    }

    private var expandedBoard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("当前事项").font(.system(size: 15, weight: .bold))
                    Text("只保留此刻要推进的事")
                        .font(.system(size: 10.5, weight: .medium))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text("\(model.activeCount)/5")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(.secondary)
                Button { model.isExpanded = false } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .bold))
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
            }

            if model.items.isEmpty {
                Text("添加 1–5 件你现在真正要推进的事。")
                    .font(.system(size: 12.5))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 42, alignment: .leading)
            } else {
                ForEach(model.items) { item in
                    HStack(spacing: 8) {
                        Button { model.toggleCompletion(for: item.id) } label: {
                            Image(systemName: item.completed ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundStyle(item.completed ? Color.green : Color.secondary)
                        }
                        .buttonStyle(.plain)
                        TextField("写下当前事项", text: model.titleBinding(for: item.id))
                            .textFieldStyle(.plain)
                            .font(.system(size: 13.5, weight: .medium))
                            .strikethrough(item.completed)
                            .foregroundStyle(item.completed ? Color.secondary : Color.primary)
                        Button { model.deleteItem(id: item.id) } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(.secondary)
                                .frame(width: 20, height: 20)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 9)
                    .frame(height: 34)
                    .background(Color.primary.opacity(0.045))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
            }

            if model.items.count < 5 {
                Button { model.addItem() } label: {
                    Label("添加当前事项", systemImage: "plus")
                        .font(.system(size: 12.5, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 28)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.accentColor)
                .background(Color.accentColor.opacity(0.09))
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            }
        }
        .padding(13)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.secondary.opacity(0.18), lineWidth: 1) }
        .shadow(color: .black.opacity(0.16), radius: 16, x: 0, y: 6)
    }
}
