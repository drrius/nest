import SwiftUI

struct TodayChoreFilter: View {
    @Binding var everyone: Bool

    var body: some View {
        Picker("Show chores", selection: $everyone) {
            Text("Me + shared").tag(false)
            Text("Everyone").tag(true)
        }
        .pickerStyle(.segmented)
        .fixedSize()
    }
}
