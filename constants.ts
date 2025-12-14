import { SalesData, StoreData, Task, TaskStatus, SocialPost, PostStatus } from './types';

// Mock Sales Data
export const SALES_PERSON_DATA: SalesData[] = [
  { name: 'Sarah J.', sales: 45000, margin: 12500, itemsSold: 32 },
  { name: 'Mike T.', sales: 38000, margin: 8200, itemsSold: 41 },
  { name: 'Jessica L.', sales: 52000, margin: 15600, itemsSold: 28 },
  { name: 'David B.', sales: 29000, margin: 5500, itemsSold: 22 },
  { name: 'Emily R.', sales: 41000, margin: 11000, itemsSold: 35 },
];

export const SALES_PERSON_DATA_LAST_YEAR: SalesData[] = [
  { name: 'Sarah J.', sales: 40000, margin: 10500, itemsSold: 29 },
  { name: 'Mike T.', sales: 42000, margin: 9000, itemsSold: 45 },
  { name: 'Jessica L.', sales: 48000, margin: 13000, itemsSold: 25 },
  { name: 'David B.', sales: 31000, margin: 6000, itemsSold: 24 },
  { name: 'Emily R.', sales: 35000, margin: 8500, itemsSold: 30 },
];

export const STORE_DATA: StoreData[] = [
  { storeName: 'Downtown Showroom', revenue: 125000, profit: 42000 },
  { storeName: 'Northside Outlet', revenue: 85000, profit: 18000 },
  { storeName: 'Suburban Mall', revenue: 98000, profit: 31000 },
];

// Mock Tasks
export const INITIAL_TASKS: Task[] = [
  { id: '1', title: 'Update Catalog Pricing', assignee: 'Sarah J.', deadline: '', status: TaskStatus.IN_PROGRESS, priority: 'high' },
  { id: '2', title: 'Order Restock for Sectionals', assignee: 'Mike T.', deadline: '', status: TaskStatus.TODO, priority: 'medium' },
  { id: '3', title: 'Coordinate Delivery Schedule', assignee: 'Dispatcher', deadline: '', status: TaskStatus.DONE, priority: 'high' },
  { id: '4', title: 'Clean Showroom Floor', assignee: 'Cleaning Crew', deadline: '', status: TaskStatus.TODO, priority: 'low' },
];

// Mock Social Posts
export const INITIAL_POSTS: SocialPost[] = [
  {
    id: 'p1',
    platform: 'Instagram',
    content: 'Check out our new velvet sectional! It brings a touch of modern elegance to any living room. Available in Navy and Emerald. #FurnitureDistributors #InteriorDesign',
    imagePlaceholder: 'https://picsum.photos/400/400',
    status: PostStatus.PENDING_APPROVAL,
    author: 'Marketing Team'
  },
  {
    id: 'p2',
    platform: 'Facebook',
    content: 'Huge blowout sale this weekend at the Northside Outlet! Up to 50% off on all dining sets. Dont miss out!',
    imagePlaceholder: 'https://picsum.photos/400/300',
    status: PostStatus.APPROVED,
    author: 'Marketing Team'
  },
  {
    id: 'p3',
    platform: 'Pinterest',
    content: '5 ways to style a coffee table for the holidays.',
    imagePlaceholder: 'https://picsum.photos/300/500',
    status: PostStatus.DRAFT,
    author: 'Intern'
  }
];
