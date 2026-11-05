import { 
  CheckSquare, 
  Calendar, 
  Bookmark, 
  Calendar as AnniversaryIcon, 
  Image, 
  Fish,
  Gamepad2,
  Newspaper,
  BookOpen,
  StickyNote,
  History,
  Music,
  MessageCircle,
  Clipboard,
  CircleDollarSign
} from 'lucide-react';

export type Role = 'admin' | 'gallery' | 'none';

interface MenuItem {
  name: string;
  url: string;
  icon?: any;
  requiredRoles?: Array<Exclude<Role, 'none'>>;
}

export const Apps: MenuItem[] = [
  {
    name: 'ToDo',
    url: '/task',
    icon: CheckSquare,
    requiredRoles: ['admin']
  },
  {
    name: '打卡',
    url: '/habit',
    icon: Calendar,
    requiredRoles: ['admin']
  },
  {
    name: '书签',
    url: '/bookmark',
    icon: Bookmark,
    requiredRoles: ['admin']
  },
  {
    name:'紀念日',
    url:'/anniversary',
    icon: AnniversaryIcon,
    requiredRoles: ['admin']
  },
  {
    name : '图床',
    url: '/gallery',
    icon: Image
  },
  {
    name: '摸鱼办',
    url: '/fishingTime',
    icon: Fish
  },

  {
    name: '每日热点',
    url: '/dailyhot',
    icon: Newspaper
  },
  { name: '命令聊天', url: '/chat', icon: MessageCircle },
  {
    name: '资产管理', url: '/fund', icon: CircleDollarSign, requiredRoles: ['admin']
  }
];

export function canAccessApp(app: MenuItem, role: Role) {
  if (!app.requiredRoles || app.requiredRoles.length === 0) {
    return true;
  }
  if (role === 'none') {
    return false;
  }
  return app.requiredRoles.includes(role);
}

export const Links: MenuItem[] = [
  {
    name: '博客',
    url: 'https://bhwa233-blog.vercel.app',
    icon: BookOpen
  },
  {
    name: '随想',
    url: 'https://memox-ten.vercel.app/',
    icon: StickyNote
  },
  {
    name: '微博历史',
    url: 'https://weibo-trending-hot-history.vercel.app',
    icon: History
  },
  {
    name: 'b站音频',
    url:'https://bilibili-audio-downloader.vercel.app',
    icon: Music
  },
  {
    name: '剪贴板',
    url: 'https://cloudpaste.404174262.workers.dev/',
    icon: Clipboard
  }
];
