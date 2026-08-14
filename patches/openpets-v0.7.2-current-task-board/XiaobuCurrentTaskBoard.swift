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
    var onComplete: (() -> Void)?

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

    var activeCount: Int {
        items.filter { !$0.completed }.count
    }

    var preferredSize: CGSize {
        guard isExpanded else { return CGSize(width: 46, height: 28) }
        guard !items.isEmpty else { return CGSize(width: 224, height: 82) }
        let visibleRowCount = min(items.count, 3)
        let rowsHeight = CGFloat(visibleRowCount) * 32
        let addHeight: CGFloat = items.count < Self.maximumItemCount ? 28 : 0
        return CGSize(width: 224, height: 42 + rowsHeight + addHeight + 10)
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

    func completeItem(id: UUID) {
        guard items.contains(where: { $0.id == id }) else { return }
        items.removeAll { $0.id == id }
        save()
        onComplete?()
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
        DispatchQueue.main.async { [weak self] in
            self?.onLayoutChanged?()
        }
    }
}

@MainActor
struct XiaobuCurrentTaskBoardView: View {
    @ObservedObject var model: XiaobuCurrentTaskBoardModel

    var body: some View {
        Group {
            if model.isExpanded {
                expandedBoard
            } else {
                collapsedHandle
            }
        }
        .frame(width: model.preferredSize.width, height: model.preferredSize.height)
    }

    private var collapsedHandle: some View {
        Button {
            model.isExpanded = true
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "checklist")
                    .font(.system(size: 11, weight: .semibold))
                Text("\(model.activeCount)")
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .monospacedDigit()
            }
            .foregroundStyle(Color(red: 0.25, green: 0.38, blue: 0.28))
            .frame(width: 46, height: 28)
            .background(Color(red: 0.94, green: 0.96, blue: 0.91).opacity(0.96))
            .clipShape(Capsule())
            .overlay { Capsule().stroke(Color(red: 0.39, green: 0.53, blue: 0.38).opacity(0.42), lineWidth: 1) }
            .shadow(color: .black.opacity(0.10), radius: 5, x: 0, y: 2)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("查看当前事项")
        .accessibilityValue("\(model.activeCount) 项进行中")
    }

    private var expandedBoard: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 6) {
                Image(systemName: "leaf.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color(red: 0.32, green: 0.49, blue: 0.31))
                Text("此刻要做")
                    .font(.system(size: 14, weight: .semibold, design: .serif))
                Spacer()
                Text("\(model.activeCount)")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Color(red: 0.32, green: 0.49, blue: 0.31))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(Color(red: 0.88, green: 0.93, blue: 0.85))
                    .clipShape(Capsule())
                Button {
                    model.isExpanded = false
                } label: {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 10, weight: .bold))
                        .frame(width: 20, height: 20)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("收起当前事项")
            }

            if model.items.isEmpty {
                Button {
                    model.addItem()
                } label: {
                    Label("写下此刻最重要的一件事", systemImage: "pencil.line")
                        .font(.system(size: 12, weight: .medium))
                        .frame(maxWidth: .infinity, minHeight: 28)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color(red: 0.30, green: 0.45, blue: 0.29))
                .background(Color(red: 0.92, green: 0.95, blue: 0.88))
                .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Color(red: 0.48, green: 0.60, blue: 0.43).opacity(0.34), style: StrokeStyle(lineWidth: 1, dash: [3, 3])) }
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else {
                ScrollView(.vertical, showsIndicators: model.items.count > 3) {
                    VStack(spacing: 3) {
                        ForEach(model.items) { item in
                            HStack(spacing: 7) {
                                TextField("写下当前事项", text: model.titleBinding(for: item.id))
                                    .textFieldStyle(.plain)
                                    .font(.system(size: 12.5, weight: .medium))
                                    .foregroundStyle(.primary)
                                Button {
                                    model.completeItem(id: item.id)
                                } label: {
                                    Label("完成", systemImage: "checkmark")
                                        .font(.system(size: 10.5, weight: .semibold))
                                        .foregroundStyle(Color(red: 0.24, green: 0.46, blue: 0.28))
                                        .padding(.horizontal, 8)
                                        .frame(height: 23)
                                        .background(Color(red: 0.86, green: 0.94, blue: 0.84))
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("完成此事项")
                            }
                            .padding(.horizontal, 7)
                            .frame(height: 29)
                            .background(Color.primary.opacity(0.04))
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        }
                    }
                }
                .frame(height: CGFloat(min(model.items.count, 3)) * 32)
            }

            if model.items.count < 5 {
                Button {
                    model.addItem()
                } label: {
                    Label("添加当前事项", systemImage: "plus")
                        .font(.system(size: 11.5, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 24)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color(red: 0.30, green: 0.45, blue: 0.29))
                .background(Color(red: 0.91, green: 0.95, blue: 0.88))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
        .padding(10)
        .background(Color(red: 0.985, green: 0.98, blue: 0.93).opacity(0.98))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color(red: 0.49, green: 0.58, blue: 0.43).opacity(0.42), lineWidth: 1)
        }
        .shadow(color: Color(red: 0.25, green: 0.34, blue: 0.22).opacity(0.15), radius: 12, x: 0, y: 5)
    }
}
