import SwiftUI

@MainActor
func identifiedDraftBinding<Value: Identifiable>(
    for value: Value, in values: Binding<[Value]>
) -> Binding<Value> {
    Binding(
        get: { values.wrappedValue.first(where: { $0.id == value.id }) ?? value },
        set: { updated in
            guard updated.id == value.id,
                let index = values.wrappedValue.firstIndex(where: { $0.id == value.id })
            else { return }
            values.wrappedValue[index] = updated
        })
}
