import React, { useState } from 'react';
import { SocialPost, PostStatus } from '../types';
import { INITIAL_POSTS } from '../constants';
import { rewriteSocialPost } from '../services/geminiService';
import { Check, X, Edit3, Wand2, Loader2, Send } from 'lucide-react';

const SocialMediaHub: React.FC = () => {
  const [posts, setPosts] = useState<SocialPost[]>(INITIAL_POSTS);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleStatusUpdate = (id: string, newStatus: PostStatus) => {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));
  };

  const handleAiEdit = async (post: SocialPost) => {
    if (!aiPrompt.trim()) return;
    
    setIsGenerating(true);
    try {
      const newContent = await rewriteSocialPost(post.content, aiPrompt);
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, content: newContent, feedback: `AI Edit Request: ${aiPrompt}` } : p));
      setAiPrompt('');
      setEditingPostId(null);
    } catch (err) {
      console.error("AI Error", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const getStatusBadge = (status: PostStatus) => {
    switch (status) {
      case PostStatus.APPROVED: return <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-semibold">Approved</span>;
      case PostStatus.REJECTED: return <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-semibold">Rejected</span>;
      case PostStatus.PENDING_APPROVAL: return <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full text-xs font-semibold">Needs Approval</span>;
      default: return <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-full text-xs font-semibold">Draft</span>;
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800">Social Media Hub</h2>
        <p className="text-slate-500">Review upcoming content for Instagram, Facebook, and Pinterest.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {posts.map(post => (
          <div key={post.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full transition-all hover:shadow-md">
            
            {/* Header / Image */}
            <div className="relative h-48 bg-slate-100">
               <img src={post.imagePlaceholder} alt="Post preview" className="w-full h-full object-cover" />
               <div className="absolute top-3 right-3">
                 <span className="bg-black/50 backdrop-blur-sm text-white px-2 py-1 rounded text-xs">
                   {post.platform}
                 </span>
               </div>
            </div>

            {/* Content Body */}
            <div className="p-5 flex-1 flex flex-col">
              <div className="flex justify-between items-center mb-3">
                {getStatusBadge(post.status)}
                <span className="text-xs text-slate-400">By {post.author}</span>
              </div>

              {editingPostId === post.id ? (
                <div className="flex-1 animate-fade-in">
                  <label className="text-xs font-semibold text-blue-600 flex items-center mb-2">
                    <Wand2 size={12} className="mr-1" />
                    AI Assistant Active
                  </label>
                  <p className="text-sm text-slate-400 mb-2 italic border-l-2 border-slate-200 pl-2">
                    "{post.content}"
                  </p>
                  <textarea
                    className="w-full text-sm border border-blue-200 rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none bg-blue-50 mb-2"
                    placeholder="E.g., Make it shorter, add more emojis, make it sound professional..."
                    rows={3}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                  />
                  <div className="flex gap-2 justify-end">
                    <button 
                      onClick={() => { setEditingPostId(null); setAiPrompt(''); }}
                      className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => handleAiEdit(post)}
                      disabled={isGenerating}
                      className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-md flex items-center hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isGenerating ? <Loader2 size={12} className="animate-spin mr-1" /> : <Wand2 size={12} className="mr-1" />}
                      Generate Edit
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-700 leading-relaxed mb-4 flex-1 whitespace-pre-wrap">
                  {post.content}
                </p>
              )}
              
              {/* Action Footer */}
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                {post.status === PostStatus.PENDING_APPROVAL ? (
                  <>
                     <div className="flex gap-2">
                        <button 
                          onClick={() => handleStatusUpdate(post.id, PostStatus.APPROVED)}
                          className="p-2 rounded-full hover:bg-green-50 text-slate-400 hover:text-green-600 transition-colors" 
                          title="Approve"
                        >
                          <Check size={18} />
                        </button>
                        <button 
                          onClick={() => handleStatusUpdate(post.id, PostStatus.REJECTED)}
                          className="p-2 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors" 
                          title="Reject"
                        >
                          <X size={18} />
                        </button>
                     </div>
                     <button 
                        onClick={() => setEditingPostId(post.id)}
                        className="flex items-center text-xs font-medium text-blue-600 hover:text-blue-800"
                     >
                       <Edit3 size={14} className="mr-1" />
                       Request Edit
                     </button>
                  </>
                ) : (
                   <div className="w-full flex justify-between items-center">
                      <span className="text-xs text-slate-400">Action taken</span>
                      {post.status !== PostStatus.APPROVED && (
                         <button 
                           onClick={() => setEditingPostId(post.id)}
                           className="flex items-center text-xs text-slate-500 hover:text-blue-600"
                        >
                          <Edit3 size={14} className="mr-1" />
                          Edit
                        </button>
                      )}
                   </div>
                )}
              </div>
            </div>
          </div>
        ))}
        
        {/* Placeholder for Add New */}
        <div className="border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center p-8 text-slate-400 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-500 transition-all cursor-pointer min-h-[300px]">
           <div className="p-4 bg-slate-50 rounded-full mb-3 group-hover:bg-white">
             <Send size={24} />
           </div>
           <p className="font-medium">Draft New Post</p>
        </div>
      </div>
    </div>
  );
};

export default SocialMediaHub;
