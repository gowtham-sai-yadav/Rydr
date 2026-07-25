export type ChatMessageView = {
  id: number;
  authorId: number;
  body: string;
  sentAtIso: string;
};

export type ChatState = {
  roomId: number;
  messages: ChatMessageView[];
  unreadCount: number;
};
