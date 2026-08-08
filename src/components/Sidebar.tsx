import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { Home, Music, ShoppingCart, ListMusic, Cpu, HardDrive, History, Settings, Users } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onNavigate }) => {
  // Query cart items count and active tasks count for navigation badges
  const badgeCounts = useLiveQuery(async () => {
    const cartCount = await db.cart.count();
    const activeTasks = await db.cart
      .where('status')
      .anyOf('preparing', 'processing', 'tagging')
      .count();
    return {
      cartCount,
      activeTasks
    };
  });

  const menuItems = [
    { id: 'home', label: 'Home', icon: <Home size={18} /> },
    { id: 'search', label: 'Discover', icon: <Music size={18} /> },
    { 
      id: 'cart', 
      label: 'My Selection', 
      icon: <ShoppingCart size={18} />, 
      badge: badgeCounts?.cartCount && badgeCounts.cartCount > 0 ? badgeCounts.cartCount : undefined 
    },
    { id: 'playlists', label: 'Playlists', icon: <ListMusic size={18} /> },
    { id: 'artists', label: 'Artists', icon: <Users size={18} /> },
    { 
      id: 'process', 
      label: 'Queue', 
      icon: <Cpu size={18} />, 
      badge: badgeCounts?.activeTasks && badgeCounts.activeTasks > 0 ? badgeCounts.activeTasks : undefined 
    },
    { id: 'usb', label: 'USB Export', icon: <HardDrive size={18} /> },
    { id: 'history', label: 'History Logs', icon: <History size={18} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
  ];

  return (
    <aside className="sidebar">
      {/* Brand Logo Header */}
      <div className="sidebar-logo">
        <ShoppingCart className="sidebar-logo-icon" size={24} />
        <div>
          <span>MPMusic</span>
          <span className="sidebar-logo-web">Web</span>
        </div>
      </div>

      {/* Nav List */}
      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <div
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
          >
            {item.icon}
            <span className="nav-item-label">{item.label}</span>
            {item.badge !== undefined && (
              <span className="nav-item-badge">{item.badge}</span>
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
};
