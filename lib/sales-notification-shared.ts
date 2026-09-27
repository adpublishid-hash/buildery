export const DEFAULT_SALES_NOTIFICATION_TEXT =
  "{name} baru saja {action} {item}";

export type SalesNotificationItem = {
  id: string;
  name: string;
  action: string;
  item: string;
  type: "product" | "course" | "membership";
  typeLabel: string;
  href: string;
  imageUrl: string | null;
  createdAt: string;
};
