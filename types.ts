export enum SalesPeriod {
  THIS_WEEK = 'THIS_WEEK',
  LAST_YEAR = 'LAST_YEAR',
  LAST_MONTH = 'LAST_MONTH'
}

export interface SalesData {
  name: string;
  sales: number;
  margin: number;
  itemsSold: number;
}

export interface StoreData {
  storeName: string;
  revenue: number;
  profit: number;
}

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE'
}

export interface Task {
  id: string;
  title: string;
  assignee: string;
  deadline: string;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high';
  sortIndex?: number;
  createdAt?: string;
  respondedAt?: string;
  completedAt?: string;
  updatedAt?: string;
}

export enum PostStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export interface SocialPost {
  id: string;
  platform: 'Instagram' | 'Facebook' | 'Pinterest';
  content: string;
  imagePlaceholder: string;
  status: PostStatus;
  author: string;
  feedback?: string;
}
