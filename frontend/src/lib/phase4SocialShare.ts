export type FeedCardView = {
  postId: number;
  authorName: string;
  body: string;
  likeCount: number;
  commentCount: number;
};

export type ShareCardPreview = {
  title: string;
  statLine: string;
  imageUrl?: string;
};
