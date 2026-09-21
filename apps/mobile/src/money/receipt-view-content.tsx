import { Image } from "expo-image";
import { ScrollView } from "react-native";
import { Page, Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { ReceiptView, ReceiptViewRuntime } from "./receipt-view-runtime";
export function ReceiptViewContent({
  runtime,
  view,
}: {
  runtime: ReceiptViewRuntime;
  view: ReceiptView;
}) {
  const receipt = view.metadata?.receipt;
  return (
    <Page>
      {!view.online ? (
        <Note>Connect to view this receipt. Attachments are not saved for offline viewing.</Note>
      ) : null}
      {view.busy ? <Note>Opening receipt…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.metadata && !receipt ? <Note>No receipt is attached to this entry.</Note> : null}
      {receipt ? (
        <Section title="Receipt">
          <Note>
            This attachment is shared with your household. Viewing it does not change financial
            history.
          </Note>
          <ReceiptMedia runtime={runtime} view={view} />
        </Section>
      ) : null}
      <NativeAction
        label="Reload receipt"
        disabled={!view.active || !view.online || view.busy}
        onPress={() => void runtime.refresh()}
      />
    </Page>
  );
}

function ReceiptMedia({ runtime, view }: { runtime: ReceiptViewRuntime; view: ReceiptView }) {
  const receipt = view.metadata!.receipt!,
    link = view.link;
  return (
    <>
      {receipt.contentType === "application/pdf" ? (
        <>
          <Note>Open the PDF in the in-app browser. Close it to return to Nest.</Note>
          <NativeAction
            label="Open PDF"
            disabled={!view.active || !view.online || view.busy}
            onPress={() => void runtime.openPdf()}
          />
        </>
      ) : link ? (
        <>
          {view.image === "loading" ? <Note>Loading image…</Note> : null}
          <ScrollView
            minimumZoomScale={1}
            maximumZoomScale={4}
            style={{ height: 480 }}
            centerContent
            accessibilityLabel="Receipt image. Pinch to zoom."
          >
            <Image
              source={{ uri: link.url }}
              style={{ width: "100%", height: 480 }}
              contentFit="contain"
              cachePolicy="none"
              recyclingKey={link.url}
              accessible
              accessibilityLabel="Household receipt"
              onLoad={() => runtime.imageReady(link)}
              onError={() => runtime.imageFailed(link)}
            />
          </ScrollView>
        </>
      ) : null}
    </>
  );
}
