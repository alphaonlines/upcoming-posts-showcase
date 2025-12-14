import React, { useState } from 'react';
import { LayoutDashboard, CheckSquare, MessageSquare, Menu, Bell, Sofa, Search } from 'lucide-react';
import SalesDashboard from './components/SalesDashboard';
import TaskManager from './components/TaskManager';
import SocialMediaHub from './components/SocialMediaHub';

enum Tab {
  OVERVIEW = 'OVERVIEW',
  TASKS = 'TASKS',
  SOCIAL = 'SOCIAL'
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.OVERVIEW);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const renderContent = () => {
    switch(activeTab) {
      case Tab.OVERVIEW: return <SalesDashboard />;
      case Tab.TASKS: return <TaskManager />;
      case Tab.SOCIAL: return <SocialMediaHub />;
      default: return <SalesDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-800">
      
      {/* Sidebar */}
      <aside 
        className={`${sidebarOpen ? 'w-64' : 'w-20'} fixed h-screen bg-slate-900 text-white transition-all duration-300 ease-in-out z-20 flex flex-col`}
      >
        <div className="h-20 flex items-center justify-center border-b border-slate-800">
           {sidebarOpen ? (
             <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
               <Sofa className="text-blue-400" />
               <span>Furniture<span className="text-slate-400">Dist</span></span>
             </div>
           ) : (
             <Sofa className="text-blue-400" size={28} />
           )}
        </div>

        <nav className="flex-1 py-8 px-4 space-y-2">
          <NavItem 
            icon={<LayoutDashboard size={20} />} 
            label="Dashboard" 
            isActive={activeTab === Tab.OVERVIEW} 
            onClick={() => setActiveTab(Tab.OVERVIEW)}
            isOpen={sidebarOpen}
          />
          <NavItem 
            icon={<CheckSquare size={20} />} 
            label="Tasks" 
            isActive={activeTab === Tab.TASKS} 
            onClick={() => setActiveTab(Tab.TASKS)}
            isOpen={sidebarOpen}
          />
          <NavItem 
            icon={<MessageSquare size={20} />} 
            label="Social Media" 
            isActive={activeTab === Tab.SOCIAL} 
            onClick={() => setActiveTab(Tab.SOCIAL)}
            isOpen={sidebarOpen}
          />
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className={`flex items-center gap-3 ${!sidebarOpen && 'justify-center'}`}>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              OD
            </div>
            {sidebarOpen && (
              <div className="overflow-hidden">
                <p className="text-sm font-medium truncate">Owner Dashboard</p>
                <p className="text-xs text-slate-400 truncate">admin@furnituredist.com</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-20'}`}>
        
        {/* Top Header */}
        <header className="h-20 bg-white border-b border-slate-200 sticky top-0 z-10 px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
            >
              <Menu size={20} />
            </button>
            <h1 className="text-xl font-semibold text-slate-800">
              {activeTab === Tab.OVERVIEW && 'Business Overview'}
              {activeTab === Tab.TASKS && 'Team Tasks'}
              {activeTab === Tab.SOCIAL && 'Social Media Management'}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Search..." 
                className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64 transition-all"
              />
            </div>
            <button className="relative p-2 hover:bg-slate-100 rounded-full text-slate-500">
              <Bell size={20} />
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <div className="p-8">
          {renderContent()}
        </div>

      </main>
    </div>
  );
};

// Helper Component for Navigation Items
interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  isOpen: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, isActive, onClick, isOpen }) => {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all
        ${isActive 
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' 
          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }
        ${!isOpen && 'justify-center'}
      `}
      title={!isOpen ? label : ''}
    >
      {icon}
      {isOpen && <span className="font-medium text-sm">{label}</span>}
    </button>
  );
};

export default App;
