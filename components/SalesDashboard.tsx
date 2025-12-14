import React, { useState, useEffect, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  ComposedChart, Line 
} from 'recharts';
import { getSalesData, getStoreData } from '../services/dataService'; // seedDatabase removed
import { isConfigured, storage } from '../services/firebase';
import { ref, uploadBytes } from 'firebase/storage';
import { SalesPeriod, SalesData, StoreData } from '../types';
import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, Database, Loader2, CloudUpload, FileSpreadsheet, CheckCircle } from 'lucide-react';

const SalesDashboard: React.FC = () => {
  const [period, setPeriod] = useState<SalesPeriod>(SalesPeriod.THIS_WEEK);
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [storeData, setStoreData] = useState<StoreData[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sales, stores] = await Promise.all([
        getSalesData(period),
        getStoreData()
      ]);
      
      setSalesData(sales);
      setStoreData(stores);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [period]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !storage) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert("Please upload a valid Excel file (.xlsx or .xls)");
      return;
    }

    setUploading(true);
    setUploadSuccess(false);

    try {
      // Upload to 'sales/' folder as required by the Cloud Function
      const storageRef = ref(storage, `sales/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      
      setUploadSuccess(true);
      // Clear success message after 3 seconds
      setTimeout(() => setUploadSuccess(false), 5000);
      
      // Note: We don't reload immediately because the Cloud Function takes a few seconds to process
    } catch (error) {
      console.error("Upload failed", error);
      alert("Failed to upload file. Check console for details.");
    } finally {
      setUploading(false);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const totalRevenue = salesData.reduce((acc, curr) => acc + curr.sales, 0);
  const totalMargin = salesData.reduce((acc, curr) => acc + curr.margin, 0);
  const isUp = period === SalesPeriod.THIS_WEEK; 

  if (loading && salesData.length === 0) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="animate-spin mb-2" size={32} />
        <p>Loading business analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in relative">
      
      {/* Configuration & Action Area */}
      {isConfigured && (
                  <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
           {/* POS Upload Button */}
           <div className="flex items-center gap-3">
              {uploadSuccess && (
                <span className="text-xs text-green-600 font-medium flex items-center animate-fade-in">
                  <CheckCircle size={14} className="mr-1" />
                  Sent to Cloud Processor
                </span>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept=".xlsx, .xls" 
                className="hidden" 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg flex items-center text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
              >
                {uploading ? <Loader2 size={18} className="animate-spin mr-2" /> : <FileSpreadsheet size={18} className="mr-2" />}
                {uploading ? "Uploading..." : "Upload POS Data"}
              </button>
           </div>
        </div>
      )}

      {!isConfigured && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3 text-sm text-amber-800">
           <Database size={16} />
           <span><strong>Demo Mode:</strong> Configure <code>services/firebase.ts</code> to connect to live data.</span>
        </div>
      )}

      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Total Sales Revenue</p>
            <h3 className="text-2xl font-bold text-slate-800">${totalRevenue.toLocaleString()}</h3>
            <div className={`flex items-center text-sm mt-1 ${isUp ? 'text-green-600' : 'text-red-500'}`}>
              {isUp ? <TrendingUp size={16} className="mr-1" /> : <TrendingDown size={16} className="mr-1" />}
              <span className="font-medium">12.5%</span>
              <span className="text-slate-400 ml-1">vs last period</span>
            </div>
          </div>
          <div className="p-3 bg-blue-50 rounded-full text-blue-600">
            <DollarSign size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Total Margin</p>
            <h3 className="text-2xl font-bold text-slate-800">${totalMargin.toLocaleString()}</h3>
            <div className={`flex items-center text-sm mt-1 ${isUp ? 'text-green-600' : 'text-red-500'}`}>
              {isUp ? <TrendingUp size={16} className="mr-1" /> : <TrendingDown size={16} className="mr-1" />}
              <span className="font-medium">8.2%</span>
              <span className="text-slate-400 ml-1">vs last period</span>
            </div>
          </div>
          <div className="p-3 bg-indigo-50 rounded-full text-indigo-600">
            <ShoppingBag size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-center">
             <label className="text-sm font-medium text-slate-500 mb-2">Compare Data Period</label>
             <select 
                value={period}
                onChange={(e) => setPeriod(e.target.value as SalesPeriod)}
                className="bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
             >
                <option value={SalesPeriod.THIS_WEEK}>This Week vs Last Week</option>
                <option value={SalesPeriod.LAST_YEAR}>This Week vs Last Year</option>
             </select>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Salesperson Performance */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-800">Salesperson Performance</h3>
            <p className="text-sm text-slate-500">Revenue vs Margin by Associate</p>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={salesData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} prefix="$" />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, undefined]}
                />
                <Legend iconType="circle" />
                <Bar dataKey="sales" name="Total Sales" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                <Line type="monotone" dataKey="margin" name="Profit Margin" stroke="#10b981" strokeWidth={3} dot={{r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff'}} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Store Location Breakdown */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-800">Store Performance</h3>
            <p className="text-sm text-slate-500">Revenue breakdown by location</p>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={storeData} layout="vertical" margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid stroke="#f1f5f9" horizontal={true} vertical={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="storeName" type="category" width={120} axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 13}} />
                <Tooltip 
                   cursor={{fill: 'transparent'}}
                   contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                   formatter={(value: number) => [`$${value.toLocaleString()}`, undefined]}
                />
                <Legend />
                <Bar dataKey="revenue" name="Revenue" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
                <Bar dataKey="profit" name="Profit" fill="#a5b4fc" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SalesDashboard;