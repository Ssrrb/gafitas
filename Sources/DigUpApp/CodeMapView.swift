import AppKit
import SwiftUI

/// Every stretch of code as a dot placed by meaning, in its folder's tint; the places dug up for the question ringed,
/// the selected one in the accent color, and the question itself in amber among them. Hover names a dot, a click on a
/// place selects its card, pinching zooms and ⌘0 fits it again.
struct CodeMapView: View {
    let ask: AskModel
    @State private var hovered: (dot: MapData.Dot, at: CGPoint)?
    @State private var zoom: CGFloat = 1
    @State private var zoomed: CGFloat = 1
    @State private var pinged = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            legend
            if let map = ask.map {
                GeometryReader { geometry in
                    let frame = CGRect(origin: .zero, size: geometry.size).insetBy(dx: 28, dy: 28)
                    canvas(map, frame: frame)
                        .onContinuousHover { phase in
                            if case .active(let location) = phase, let dot = nearest(map, to: location, in: frame) {
                                hovered = (dot, location)
                            } else {
                                hovered = nil
                            }
                        }
                        .onTapGesture { location in
                            guard let dot = nearest(map, to: location, in: frame),
                                  let row = ask.places.first(where: { $0.segmentID == dot.segment }) else { return }
                            ask.select(row)
                        }
                        .gesture(MagnifyGesture()
                            .onChanged { zoom = min(max(zoomed * $0.magnification, 1), 8) }
                            .onEnded { _ in zoomed = zoom })
                        .overlay(alignment: .topLeading) { label }
                }
                .clipped()
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Map of \(map.dots.count) stretches of code by meaning")
                .accessibilityHint("The places found for the question are listed on the left, nearest first.")
            } else {
                ProgressView().controlSize(.small).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            Text("Each dot is a stretch of code placed by meaning. The map flattens 768 directions into 2, so a close "
                 + "match can sit far away; matches are ringed.")
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
        }
        .background {
            Button("") { zoom = 1; zoomed = 1 }.keyboardShortcut("0", modifiers: .command).hidden()
        }
        .onChange(of: ask.questionVector) { pinged = false }
    }

    private var legend: some View {
        HStack(spacing: 12) {
            ForEach(ask.projects) { project in
                HStack(spacing: 5) {
                    Circle().fill(Brand.projectTint(project.index)).frame(width: 7, height: 7)
                    Text(project.name).font(.system(size: 11))
                }
            }
            if ask.questionPlace != nil {
                HStack(spacing: 5) {
                    Circle().fill(Brand.amber).frame(width: 7, height: 7)
                    Text("Your question").font(.system(size: 11))
                }
            }
        }
        .foregroundStyle(.secondary)
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    @ViewBuilder private var label: some View {
        if let hovered {
            Text(hovered.dot.path.isEmpty ? "?" : shortPath(hovered.dot.path))
                .font(.system(size: 11))
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(.regularMaterial))
                .offset(x: hovered.at.x + 12, y: hovered.at.y + 10)
                .allowsHitTesting(false)
        }
    }

    private func canvas(_ map: MapData, frame: CGRect) -> some View {
        let matches = Set(ask.places.map(\.segmentID))
        let selected = ask.selectedRow?.segmentID
        let question = ask.questionPlace
        return Canvas { context, _ in
            // A few hundred dots can be bigger and stronger than thousands without turning into a smear.
            let (size, strength): (CGFloat, Double) = map.dots.count < 500 ? (5, 0.6) : (2.5, 0.35)
            for dot in map.dots where !matches.contains(dot.segment) {
                let point = place(dot.x, dot.y, in: frame)
                context.fill(Path(ellipseIn: CGRect(x: point.x - size / 2, y: point.y - size / 2, width: size, height: size)),
                             with: .color(Brand.projectTint(dot.tint).opacity(strength)))
            }
            for dot in map.dots where matches.contains(dot.segment) {
                let point = place(dot.x, dot.y, in: frame)
                let tint = Brand.projectTint(dot.tint)
                context.fill(Path(ellipseIn: CGRect(x: point.x - 2.5, y: point.y - 2.5, width: 5, height: 5)),
                             with: .color(tint))
                let ring = dot.segment == selected ? 6.0 : 4.5
                context.stroke(Path(ellipseIn: CGRect(x: point.x - ring, y: point.y - ring, width: ring * 2, height: ring * 2)),
                               with: .color(dot.segment == selected ? Color.accentColor : tint),
                               lineWidth: dot.segment == selected ? 2 : 1)
            }
            if let question {
                let point = place(question.x, question.y, in: frame)
                context.stroke(Path(ellipseIn: CGRect(x: point.x - 8, y: point.y - 8, width: 16, height: 16)),
                               with: .color(Brand.amber), lineWidth: 1)
                context.fill(Path(ellipseIn: CGRect(x: point.x - 4.5, y: point.y - 4.5, width: 9, height: 9)),
                             with: .color(Brand.amber))
            }
        }
        .overlay {
            // The question pings once when it lands (not with Reduce Motion).
            if let question, !reduceMotion {
                let point = place(question.x, question.y, in: frame)
                Circle()
                    .stroke(Brand.amber, lineWidth: 1)
                    .frame(width: 16, height: 16)
                    .scaleEffect(pinged ? 3 : 1)
                    .opacity(pinged ? 0 : 0.8)
                    .position(point)
                    .allowsHitTesting(false)
                    .onAppear { withAnimation(.easeOut(duration: 1.2)) { pinged = true } }
            }
        }
    }

    /// A dot's place in the frame, zoomed in on its middle.
    private func place(_ x: CGFloat, _ y: CGFloat, in frame: CGRect) -> CGPoint {
        CGPoint(x: frame.midX + (frame.minX + x * frame.width - frame.midX) * zoom,
                y: frame.midY + (frame.minY + (1 - y) * frame.height - frame.midY) * zoom)
    }

    /// The dot under the pointer (within 8 points), places first.
    private func nearest(_ map: MapData, to location: CGPoint, in frame: CGRect) -> MapData.Dot? {
        let matches = Set(ask.places.map(\.segmentID))
        var best: (MapData.Dot, CGFloat)?
        for dot in map.dots {
            let point = place(dot.x, dot.y, in: frame)
            var distance = hypot(point.x - location.x, point.y - location.y)
            if matches.contains(dot.segment) { distance -= 3 }
            if distance < 8, distance < best?.1 ?? .infinity { best = (dot, distance) }
        }
        return best?.0
    }

    /// "billing-service/billing/retry.py": from the code folder on.
    private func shortPath(_ path: String) -> String {
        guard let project = ask.projects.filter({ path.hasPrefix($0.path + "/") }).max(by: { $0.path.count < $1.path.count })
        else { return (path as NSString).lastPathComponent }
        return project.name + "/" + path.dropFirst(project.path.count + 1)
    }
}
