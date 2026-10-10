import { AbstractChat, type ChatInit, type ChatState, type ChatStatus, type UIMessage } from "ai";

/** In-memory SDK state for protocol tests; there is no UI or React subscription layer. */
class ProtocolState<Message extends UIMessage> implements ChatState<Message> {
  status: ChatStatus = "ready";
  error: Error | undefined;
  messages: Message[];

  constructor(messages: Message[]) {
    this.messages = structuredClone(messages);
  }
  pushMessage(message: Message) {
    this.messages = [...this.messages, message];
  }
  popMessage() {
    this.messages = this.messages.slice(0, -1);
  }
  replaceMessage(index: number, message: Message) {
    this.messages = this.messages.map((value, position) => (position === index ? message : value));
  }
  snapshot<Value>(value: Value): Value {
    return structuredClone(value);
  }
}

export class ProtocolChat<Message extends UIMessage> extends AbstractChat<Message> {
  constructor({ messages = [], ...options }: ChatInit<Message>) {
    super({ ...options, state: new ProtocolState(messages) });
  }
}
