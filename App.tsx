
import React, { useState, useRef, useEffect } from 'react';
import { Chat } from '@google/genai';
import { createChatSession, sendMessageStream } from './services/geminiService';
import { Message, AuthUser } from './types';
import { ChatMessage } from './components/ChatMessage';
import { 
  SendIcon, LoadingSpinner, TrashIcon, BotIcon, LockIcon, LogOutIcon, 
  UsersIcon, UserIcon, PlusIcon, XIcon, InfinityIcon, ClockIcon, PowerIcon, EditIcon, TelegramIcon,
  ShieldCheckIcon, CheckSmallIcon, MailWarningIcon, InfoIcon, SearchIcon, FilterIcon,
  SmartphoneIcon, LinkBreakIcon, GiftIcon
} from './components/Icons';

const MAX_MESSAGES = 10;
const SUPER_ADMIN = 'OBEIDA172004';
const VIP_USER = 'ABOOD172004';
// Hardcoded system overrides
const SYSTEM_UNLIMITED_USERS = [SUPER_ADMIN, VIP_USER];
const LS_AUTHORIZED_USERS_KEY = 'red_ai_authorized_users_v2';
const LS_DEVICE_ID_KEY = 'red_ai_device_id';

const CHAT_RULES = [
  "عدم إستخدام الألفاظ غير لائقة",
  "الوضوح في الطلب",
  "الاحترام والمهنية",
  "تجنب المعلومات الخاصة",
  "مسؤولية التحقق",
  "المسؤولية عن الاستخدام",
  "التغذية الراجعة البناءة"
];

// Matrix Background Component
const MatrixBackground = () => (
  <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
    {/* Fine Green Grid */}
    <div 
      className="absolute inset-0 opacity-[0.05]"
      style={{
        backgroundImage: `linear-gradient(rgba(0, 255, 0, 0.8) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 255, 0, 0.8) 1px, transparent 1px)`,
        backgroundSize: '20px 20px'
      }}
    />
    {/* Scanline Effect - Horizontal Lines */}
    <div 
      className="absolute inset-0 opacity-[0.07]"
      style={{
        backgroundImage: 'linear-gradient(transparent 50%, rgba(0, 255, 0, 0.5) 50%)',
        backgroundSize: '100% 4px'
      }}
    />
    {/* CRT Vignette */}
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_50%,rgba(0,0,0,0.6)_100%)]" />
  </div>
);

export default function App() {
  // Authentication State
  const [user, setUser] = useState<string | null>(() => {
    return localStorage.getItem('red_ai_user');
  });
  const [currentUserData, setCurrentUserData] = useState<AuthUser | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [deviceId, setDeviceId] = useState<string>('');
  const [isRegisteringFree, setIsRegisteringFree] = useState(false);
  
  // Admin State
  const [authorizedUsers, setAuthorizedUsers] = useState<AuthUser[]>([]);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [viewingUser, setViewingUser] = useState<AuthUser | null>(null);
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean, username: string | null}>({
    isOpen: false,
    username: null
  });

  // Admin Search & Sort State
  const [adminSearchTerm, setAdminSearchTerm] = useState('');
  const [adminFilterStatus, setAdminFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [adminFilterPlan, setAdminFilterPlan] = useState<'all' | 'free' | 'paid'>('all'); // New filter
  const [adminSortOption, setAdminSortOption] = useState<'newest' | 'oldest' | 'username' | 'expiry'>('newest');
  
  // Add/Edit User Form State
  const [newUserInput, setNewUserInput] = useState('');
  const [newUserUnlimited, setNewUserUnlimited] = useState(false);
  const [newUserDuration, setNewUserDuration] = useState('');

  // Complaint State
  const [showComplaintModal, setShowComplaintModal] = useState(false);
  const [complaintName, setComplaintName] = useState('');
  const [complaintText, setComplaintText] = useState('');

  // Chat State
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      content: 'Hello. I am your professional AI assistant. How can I assist you today?\n\nمرحباً. أنا مساعدك الذكي المحترف. كيف يمكنني مساعدتك اليوم؟',
      timestamp: Date.now(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messageCount, setMessageCount] = useState(0);

  const chatSessionRef = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Derived Access Rights
  const isSuperAdmin = user === SUPER_ADMIN;
  const isUnlimited = user 
    ? (SYSTEM_UNLIMITED_USERS.includes(user) || currentUserData?.isUnlimited) 
    : false;

  const hasUserMessages = messages.some(m => m.role === 'user');

  // Compute Filtered Users
  const filteredAndSortedUsers = authorizedUsers
    .filter(user => {
      // Search Filter
      if (adminSearchTerm && !user.username.toLowerCase().includes(adminSearchTerm.toLowerCase())) {
        return false;
      }
      // Status Filter
      if (adminFilterStatus === 'active' && !user.isActive) return false;
      if (adminFilterStatus === 'inactive' && user.isActive) return false;

      // Plan Filter
      if (adminFilterPlan === 'free' && !user.isFreeTrial) return false;
      if (adminFilterPlan === 'paid' && user.isFreeTrial) return false;

      return true;
    })
    .sort((a, b) => {
      switch (adminSortOption) {
        case 'newest':
          return (b.createdAt || 0) - (a.createdAt || 0);
        case 'oldest':
          return (a.createdAt || 0) - (b.createdAt || 0);
        case 'username':
          return a.username.localeCompare(b.username);
        case 'expiry':
           // Sort by closest expiry. Permanent (null) considered as far future
           const expiryA = a.expiryDate || 8640000000000000;
           const expiryB = b.expiryDate || 8640000000000000;
           return expiryA - expiryB;
        default:
          return 0;
      }
    });

  // Init Device ID and Load Users
  useEffect(() => {
    // 1. Device ID Generation
    let storedDeviceId = localStorage.getItem(LS_DEVICE_ID_KEY);
    if (!storedDeviceId) {
      storedDeviceId = crypto.randomUUID();
      localStorage.setItem(LS_DEVICE_ID_KEY, storedDeviceId);
    }
    setDeviceId(storedDeviceId);

    // 2. Load Users
    const storedUsersV2 = localStorage.getItem(LS_AUTHORIZED_USERS_KEY);
    if (storedUsersV2) {
      try {
        setAuthorizedUsers(JSON.parse(storedUsersV2));
      } catch (e) {
        setAuthorizedUsers([]);
      }
    } else {
      // Migration V1 -> V2
      const storedUsersV1 = localStorage.getItem('red_ai_authorized_users');
      if (storedUsersV1) {
        try {
          const oldList = JSON.parse(storedUsersV1);
          if (Array.isArray(oldList)) {
            const migrated: AuthUser[] = oldList.map(u => ({
              username: u,
              isUnlimited: false,
              expiryDate: null,
              isActive: true,
              createdAt: Date.now()
            }));
            setAuthorizedUsers(migrated);
            localStorage.setItem(LS_AUTHORIZED_USERS_KEY, JSON.stringify(migrated));
          }
        } catch(e) { console.error("Migration failed", e); }
      }
    }
  }, []);

  // Initialize chat session on mount or user change
  useEffect(() => {
    if (user) {
      chatSessionRef.current = createChatSession();
      // Load message count for this user
      const storedCount = localStorage.getItem(`msg_count_${user}`);
      setMessageCount(storedCount ? parseInt(storedCount, 10) : 0);
      
      // Determine Current User Profile
      if (SYSTEM_UNLIMITED_USERS.includes(user)) {
        setCurrentUserData({
          username: user,
          isUnlimited: true,
          expiryDate: null,
          isActive: true,
          createdAt: 0
        });
        return;
      }

      const currentListStr = localStorage.getItem(LS_AUTHORIZED_USERS_KEY);
      const currentList: AuthUser[] = currentListStr ? JSON.parse(currentListStr) : [];
      const foundUser = currentList.find(u => u.username === user);
      
      if (foundUser) {
        // Validate Status
        if (!foundUser.isActive) {
          handleLogout();
          setLoginError('ACCOUNT INACTIVE / الحساب غير نشط');
          return;
        }
        // Validate Expiry
        if (foundUser.expiryDate && Date.now() > foundUser.expiryDate) {
          handleLogout();
          setLoginError('SUBSCRIPTION EXPIRED / انتهى الاشتراك');
          return;
        }
        // Device Lock Check done at login, but good to ensure consistent state
        setCurrentUserData(foundUser);
      } else {
         handleLogout();
         setLoginError('AUTHORIZATION REVOKED');
      }
    }
  }, [user]);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, user, showAdminPanel]);

  const saveUsers = (users: AuthUser[]) => {
    setAuthorizedUsers(users);
    localStorage.setItem(LS_AUTHORIZED_USERS_KEY, JSON.stringify(users));
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    
    if (!usernameInput.trim()) return;
    const inputIdentity = usernameInput.trim();

    // 1. Check System Users (Always allowed, ignore device lock)
    if (SYSTEM_UNLIMITED_USERS.includes(inputIdentity)) {
      completeLogin(inputIdentity);
      return;
    }

    // 2. Check Dynamic Users
    const foundUser = authorizedUsers.find(u => u.username === inputIdentity);
    if (foundUser) {
      if (!foundUser.isActive) {
        setLoginError('ACCOUNT INACTIVE / الحساب غير نشط');
        return;
      }
      if (foundUser.expiryDate && Date.now() > foundUser.expiryDate) {
         setLoginError('SUBSCRIPTION EXPIRED / انتهى الاشتراك');
         return;
      }

      // Device Locking Logic
      if (foundUser.deviceId) {
        if (foundUser.deviceId !== deviceId) {
          setLoginError('LOCKED TO ANOTHER DEVICE / حساب مقيد بجهاز آخر');
          return;
        }
      } else {
        // First login: Lock to this device
        const updatedUsers = authorizedUsers.map(u => 
          u.username === inputIdentity ? { ...u, deviceId: deviceId } : u
        );
        saveUsers(updatedUsers);
      }

      completeLogin(inputIdentity);
      return;
    }

    // 3. Deny
    setLoginError('ACCESS DENIED / يرجى الاشتراك');
  };

  const handleFreeRegistration = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (!usernameInput.trim()) return;
    const username = usernameInput.trim();

    // Check if username already exists
    if (authorizedUsers.some(u => u.username === username) || SYSTEM_UNLIMITED_USERS.includes(username)) {
      setLoginError('USERNAME TAKEN / اسم المستخدم محجوز');
      return;
    }

    // Check if THIS device already has a registered account
    const deviceExistingUser = authorizedUsers.find(u => u.deviceId === deviceId && u.isActive);
    if (deviceExistingUser) {
      setLoginError(`DEVICE ALREADY REGISTERED (${deviceExistingUser.username}) / جهازك مسجل بالفعل`);
      return;
    }

    // Create Free User (7 Days, 10 Messages)
    const freeUser: AuthUser = {
      username: username,
      isUnlimited: false,
      expiryDate: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
      isActive: true,
      createdAt: Date.now(),
      deviceId: deviceId, // Lock immediately
      isFreeTrial: true
    };

    saveUsers([...authorizedUsers, freeUser]);
    completeLogin(username);
  };

  const completeLogin = (identity: string) => {
    localStorage.setItem('red_ai_user', identity);
    setUser(identity);
    
    let welcomeText = `Welcome back, ${identity}. System online.`;
    if (identity === SUPER_ADMIN) {
      welcomeText = `Welcome, Administrator ${identity}. Full system access granted.`;
    } else if (identity === VIP_USER) {
      welcomeText = `Welcome, VIP ${identity}. Unlimited access granted.`;
    }

    setMessages([
      {
        id: 'welcome',
        role: 'model',
        content: welcomeText,
        timestamp: Date.now(),
      }
    ]);
  };

  const handleLogout = () => {
    localStorage.removeItem('red_ai_user');
    setUser(null);
    setCurrentUserData(null);
    setUsernameInput('');
    setLoginError('');
    setIsRegisteringFree(false);
    setMessages([]);
    setShowAdminPanel(false);
    chatSessionRef.current = null;
  };

  const handleClearChat = () => {
    if (confirm('Are you sure you want to clear the conversation?')) {
      setMessages([]);
      chatSessionRef.current = createChatSession();
    }
  };

  // --- Admin Functions ---

  const handleEditClick = (targetUser: AuthUser) => {
    setEditingUser(targetUser.username);
    setNewUserInput(targetUser.username);
    setNewUserUnlimited(targetUser.isUnlimited);
    
    if (targetUser.expiryDate) {
      // Calculate remaining days roughly
      const diffTime = targetUser.expiryDate - Date.now();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setNewUserDuration(diffDays > 0 ? diffDays.toString() : '');
    } else {
      setNewUserDuration('');
    }
  };

  const cancelEdit = () => {
    setEditingUser(null);
    setNewUserInput('');
    setNewUserUnlimited(false);
    setNewUserDuration('');
  };

  const setFreeTrialPreset = () => {
    setNewUserUnlimited(false);
    setNewUserDuration('7');
  };

  const handleAddOrUpdateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserInput.trim()) return;
    const username = newUserInput.trim();
    
    // Safety check for system users
    if (SYSTEM_UNLIMITED_USERS.includes(username)) {
      alert('This user is a reserved system administrator.');
      return;
    }

    // Determine Expiry Date
    let expiryDate = null;
    const days = parseInt(newUserDuration);
    if (!isNaN(days) && days > 0) {
      expiryDate = Date.now() + (days * 24 * 60 * 60 * 1000);
    }

    // UPDATE EXISTING USER
    if (editingUser) {
      const updatedList = authorizedUsers.map(u => {
        if (u.username === editingUser) {
          return {
            ...u,
            isUnlimited: newUserUnlimited,
            expiryDate: expiryDate,
          };
        }
        return u;
      });
      saveUsers(updatedList);
      cancelEdit(); // Reset form
      return;
    }

    // ADD NEW USER
    if (authorizedUsers.some(u => u.username === username)) {
      alert('User already exists. Use Edit button to modify.');
      return;
    }

    const newUser: AuthUser = {
      username,
      isUnlimited: newUserUnlimited,
      expiryDate,
      isActive: true, // Default active
      createdAt: Date.now(),
      isFreeTrial: false, // Admin added users are typically paid/verified
      deviceId: undefined // Not linked yet
    };

    saveUsers([...authorizedUsers, newUser]);
    
    // Reset Form
    setNewUserInput('');
    setNewUserUnlimited(false);
    setNewUserDuration('');
  };

  const initiateDeleteUser = (e: React.MouseEvent, targetUser: string) => {
    e.stopPropagation(); 
    setDeleteModal({ isOpen: true, username: targetUser });
  };

  const confirmDeleteUser = () => {
    if (!deleteModal.username) return;

    const targetUser = deleteModal.username;
    const updatedList = authorizedUsers.filter(u => u.username !== targetUser);
    saveUsers(updatedList);
    
    if (editingUser === targetUser) cancelEdit();
    setDeleteModal({ isOpen: false, username: null });
  };

  const toggleUserStatus = (targetUser: string) => {
    const updated = authorizedUsers.map(u => {
      if (u.username === targetUser) {
        return { ...u, isActive: !u.isActive };
      }
      return u;
    });
    saveUsers(updated);
  };
  
  const unlinkDevice = (targetUser: string) => {
    const updated = authorizedUsers.map(u => {
        if (u.username === targetUser) {
            return { ...u, deviceId: undefined };
        }
        return u;
    });
    saveUsers(updated);
  };

  const handleViewUser = (e: React.MouseEvent, user: AuthUser) => {
    e.stopPropagation();
    setViewingUser(user);
  };

  const getUserMessageCount = (username: string) => {
    const count = localStorage.getItem(`msg_count_${username}`);
    return count ? parseInt(count, 10) : 0;
  };

  const handleHeaderProfileClick = () => {
    if (currentUserData) {
      setViewingUser(currentUserData);
    }
  };

  const handleSendComplaint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaintName || !complaintText) return;
    const subject = encodeURIComponent(`Complaint from ${complaintName}`);
    const body = encodeURIComponent(`User: ${complaintName}\n\nMessage:\n${complaintText}`);
    window.location.href = `mailto:obeidanoorhamdan@gmail.com?subject=${subject}&body=${body}`;
    setShowComplaintModal(false);
    setComplaintText('');
    setComplaintName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isUnlimited && messageCount >= MAX_MESSAGES) return;
    if (!input.trim() || isLoading || !chatSessionRef.current || !user) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    const tempBotMessageId = (Date.now() + 1).toString();
    const tempBotMessage: Message = {
      id: tempBotMessageId,
      role: 'model',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };

    if (!isUnlimited) {
      const newCount = messageCount + 1;
      setMessageCount(newCount);
      localStorage.setItem(`msg_count_${user}`, newCount.toString());
    }

    setMessages(prev => [...prev, userMessage, tempBotMessage]);
    setInput('');
    setIsLoading(true);

    try {
      let fullResponse = '';
      await sendMessageStream(chatSessionRef.current, userMessage.content, (textChunk) => {
        fullResponse += textChunk;
        setMessages(prev => 
          prev.map(msg => 
            msg.id === tempBotMessageId ? { ...msg, content: fullResponse } : msg
          )
        );
      });
      setMessages(prev => 
        prev.map(msg => 
          msg.id === tempBotMessageId ? { ...msg, isStreaming: false } : msg
        )
      );
    } catch (error) {
      console.error(error);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'model',
          content: 'Sorry, I encountered an error processing your request. Please try again.',
          timestamp: Date.now(),
        }
      ]);
      setMessages(prev => prev.filter(msg => msg.id !== tempBotMessageId || msg.content !== ''));
    } finally {
      setIsLoading(false);
    }
  };

  // --- Login Screen ---
  if (!user) {
    return (
      <div className="flex flex-col h-[100dvh] bg-black text-white font-sans items-center justify-center p-4 relative overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-900/10 rounded-full blur-[100px] animate-pulse-slow"></div>
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-red-800/10 rounded-full blur-[80px] animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
        
        <div className="w-full max-w-md bg-neutral-900/50 backdrop-blur-xl border border-red-900/50 rounded-2xl shadow-[0_0_50px_rgba(153,27,27,0.2)] p-8 relative z-10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-red-950 to-black rounded-2xl flex items-center justify-center border border-red-800 mb-6 shadow-[0_0_20px_rgba(220,38,38,0.2)]">
              <BotIcon className="w-10 h-10 text-red-500" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2">ABOOD AI ACCESS</h1>
            <p className="text-red-400/80 text-sm tracking-widest uppercase">
              {isRegisteringFree ? 'Free Trial Registration' : 'Secure Terminal'}
            </p>
          </div>

          <form onSubmit={isRegisteringFree ? handleFreeRegistration : handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="username" className="text-xs text-gray-400 uppercase tracking-wider font-semibold ml-1">
                {isRegisteringFree ? 'Create Username' : 'Identity Check'}
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-red-500 transition-colors">
                  <LockIcon className="w-5 h-5" />
                </div>
                <input
                  id="username"
                  type="text"
                  value={usernameInput}
                  onChange={(e) => {
                    setUsernameInput(e.target.value);
                    if (loginError) setLoginError('');
                  }}
                  placeholder={isRegisteringFree ? "Choose a username..." : "Enter User ID..."}
                  className={`w-full bg-black/50 text-white border rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:ring-1 transition-all placeholder:text-neutral-700
                    ${loginError 
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' 
                      : 'border-neutral-800 focus:border-red-600 focus:ring-red-600/50'
                    }`}
                  autoFocus
                />
              </div>
              {loginError && (
                <div className="text-red-500 text-xs font-bold tracking-wide mt-2 flex items-center gap-1.5 animate-pulse">
                  <span className="block w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                  {loginError}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!usernameInput.trim()}
              className={`w-full py-3.5 rounded-lg font-semibold tracking-wide transition-all duration-300 relative overflow-hidden group
                ${usernameInput.trim() 
                  ? 'bg-red-700 hover:bg-red-600 text-white shadow-[0_0_20px_rgba(185,28,28,0.4)] hover:shadow-[0_0_30px_rgba(220,38,38,0.6)]' 
                  : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                }`}
            >
              <span className="relative z-10">
                {isRegisteringFree ? 'REGISTER & ENTER' : 'AUTHENTICATE'}
              </span>
            </button>
            
            {!isRegisteringFree && (
              <button
                type="button"
                onClick={() => {
                   setIsRegisteringFree(true);
                   setLoginError('');
                   setUsernameInput('');
                }}
                className="w-full py-2.5 rounded-lg font-medium tracking-wide text-sm bg-neutral-900 border border-neutral-800 text-green-500 hover:bg-green-900/10 hover:border-green-800/50 transition-all flex items-center justify-center gap-2"
              >
                <GiftIcon className="w-4 h-4" />
                Start 7-Day Free Trial / تجربة مجانية
              </button>
            )}

            {isRegisteringFree && (
              <button
                type="button"
                onClick={() => {
                   setIsRegisteringFree(false);
                   setLoginError('');
                   setUsernameInput('');
                }}
                className="w-full text-xs text-gray-500 hover:text-white transition-colors"
              >
                Cancel Registration
              </button>
            )}

          </form>
          
          {!isRegisteringFree && (
            <div className="mt-8 pt-6 border-t border-neutral-800 text-center flex flex-col items-center gap-3">
               <p className="text-[10px] text-neutral-600 uppercase tracking-widest">Subscription Required for Access</p>
               <a 
                 href="https://t.me/Ab00dAi" 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-[#2AABEE]/10 border border-neutral-800 hover:border-[#2AABEE]/50 rounded-full transition-all duration-300 group"
               >
                 <TelegramIcon className="w-5 h-5 text-neutral-400 group-hover:text-[#2AABEE]" />
                 <span className="text-xs font-medium text-neutral-400 group-hover:text-[#2AABEE]">
                   Subscribe via @Ab00dAi
                 </span>
               </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Main Chat Interface ---
  const remaining = isUnlimited ? 999 : Math.max(0, MAX_MESSAGES - messageCount);
  const isLimitReached = !isUnlimited && messageCount >= MAX_MESSAGES;

  return (
    <div className="flex flex-col h-[100dvh] bg-black text-gray-200 overflow-hidden font-sans selection:bg-red-500/30 selection:text-red-100 relative">
      <MatrixBackground />
      
      {/* Complaint Modal */}
      {showComplaintModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-neutral-900 border border-yellow-900/50 rounded-2xl shadow-2xl p-6 relative">
             <button onClick={() => setShowComplaintModal(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white">
               <XIcon className="w-6 h-6" />
             </button>
             <div className="flex items-center gap-3 mb-4 text-yellow-500">
               <MailWarningIcon className="w-6 h-6" />
               <h3 className="font-bold text-lg">Report / Complaint</h3>
             </div>
             <form onSubmit={handleSendComplaint} className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 uppercase mb-1">Your Name</label>
                  <input 
                    type="text" 
                    value={complaintName}
                    onChange={e => setComplaintName(e.target.value)}
                    className="w-full bg-black border border-neutral-800 rounded-lg p-2 focus:border-yellow-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 uppercase mb-1">Complaint Details</label>
                  <textarea 
                    value={complaintText}
                    onChange={e => setComplaintText(e.target.value)}
                    className="w-full bg-black border border-neutral-800 rounded-lg p-2 focus:border-yellow-500 outline-none h-32 resize-none"
                    required
                  />
                </div>
                <button type="submit" className="w-full bg-yellow-700 hover:bg-yellow-600 text-white font-bold py-2 rounded-lg transition-colors">
                  Send to Support
                </button>
             </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-neutral-900 border border-red-900/50 rounded-2xl shadow-[0_0_30px_rgba(220,38,38,0.2)] p-6 relative overflow-hidden">
             {/* Background glow */}
             <div className="absolute top-0 right-0 w-32 h-32 bg-red-900/20 rounded-full blur-[50px] pointer-events-none"></div>
             
             <div className="flex flex-col items-center text-center relative z-10">
               <div className="w-12 h-12 bg-red-950/50 rounded-full flex items-center justify-center mb-4 border border-red-900">
                 <TrashIcon className="w-6 h-6 text-red-500" />
               </div>
               
               <h3 className="text-lg font-bold text-white mb-2">Confirm Deletion</h3>
               <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                 Are you sure you want to delete <span className="text-red-400 font-mono font-bold block mt-1 text-base">{deleteModal.username}</span>
                 <span className="block mt-2 text-xs uppercase tracking-wider text-red-500/80">This action cannot be undone.</span>
               </p>
               
               <div className="flex w-full gap-3">
                 <button 
                   onClick={() => setDeleteModal({ isOpen: false, username: null })}
                   className="flex-1 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-gray-300 rounded-lg font-medium transition-colors text-sm"
                 >
                   Cancel
                 </button>
                 <button 
                   onClick={confirmDeleteUser}
                   className="flex-1 px-4 py-2.5 bg-red-700 hover:bg-red-600 text-white rounded-lg font-bold shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all text-sm"
                 >
                   Delete User
                 </button>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* Admin Panel Modal */}
      {showAdminPanel && isSuperAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-[95%] max-w-2xl bg-neutral-900 border border-red-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-red-950 to-neutral-900 p-4 border-b border-red-900/50 flex justify-between items-center flex-none">
              <h2 className="font-bold text-white flex items-center gap-2">
                <UsersIcon className="w-5 h-5 text-red-500" />
                Admin Console
              </h2>
              <button onClick={() => setShowAdminPanel(false)} className="text-gray-400 hover:text-white">
                <XIcon className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-4 md:p-6 space-y-6 overflow-y-auto custom-scrollbar">
              {/* Add/Edit User Form */}
              <div className={`bg-neutral-900/50 border ${editingUser ? 'border-yellow-600/30 bg-yellow-900/10' : 'border-neutral-800'} p-4 rounded-xl space-y-4 transition-colors`}>
                 <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                   {editingUser ? <><EditIcon className="w-4 h-4 text-yellow-500" /> Edit Subscription</> : <><PlusIcon className="w-4 h-4" /> Add New Subscription</>}
                 </h3>
                 
                 <form onSubmit={handleAddOrUpdateUser} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-4 space-y-1">
                      <label className="text-[10px] text-gray-500 uppercase">Username</label>
                      <input
                        type="text"
                        value={newUserInput}
                        onChange={(e) => setNewUserInput(e.target.value)}
                        placeholder="ID..."
                        disabled={!!editingUser}
                        className={`w-full bg-black border rounded-lg px-3 py-2 text-sm focus:outline-none 
                          ${editingUser ? 'border-neutral-800 text-gray-500 cursor-not-allowed' : 'border-neutral-700 focus:border-red-500'}`}
                      />
                    </div>
                    
                    <div className="md:col-span-3 space-y-1">
                       <label className="text-[10px] text-gray-500 uppercase">Duration (Days)</label>
                       <div className="relative">
                         <input
                           type="number"
                           min="1"
                           value={newUserDuration}
                           onChange={(e) => setNewUserDuration(e.target.value)}
                           placeholder="Permanent"
                           className="w-full bg-black border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
                         />
                         <ClockIcon className="absolute right-3 top-2.5 w-4 h-4 text-neutral-600 pointer-events-none" />
                       </div>
                    </div>

                    <div className="md:col-span-3 flex items-center h-10 px-1">
                       <label className="flex items-center gap-2 cursor-pointer select-none">
                         <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${newUserUnlimited ? 'bg-red-600 border-red-600' : 'border-neutral-600 bg-transparent'}`}>
                           {newUserUnlimited && <InfinityIcon className="w-3 h-3 text-white" />}
                         </div>
                         <input 
                           type="checkbox" 
                           className="hidden" 
                           checked={newUserUnlimited} 
                           onChange={(e) => setNewUserUnlimited(e.target.checked)} 
                         />
                         <span className="text-xs text-gray-300">Unlimited (لا محدود)</span>
                       </label>
                    </div>

                    <div className="md:col-span-2 flex gap-2">
                       {editingUser && (
                         <button 
                           type="button"
                           onClick={cancelEdit}
                           className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-gray-300 py-2 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
                           title="Cancel"
                         >
                           <XIcon className="w-4 h-4" />
                         </button>
                       )}
                       <button 
                         type="submit"
                         disabled={!newUserInput.trim()}
                         className={`flex-1 ${editingUser ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-red-700 hover:bg-red-600'} disabled:bg-neutral-800 disabled:text-neutral-500 text-white py-2 rounded-lg flex items-center justify-center text-sm font-medium transition-colors`}
                       >
                         {editingUser ? 'Update' : 'Add'}
                       </button>
                    </div>

                    {!editingUser && (
                      <div className="md:col-span-12 flex justify-end mt-1">
                         <button
                           type="button"
                           onClick={setFreeTrialPreset}
                           className="text-[10px] bg-neutral-800 hover:bg-green-900/30 border border-neutral-700 hover:border-green-800 text-green-500 px-2 py-1 rounded transition-colors"
                         >
                           + 7-Day Free User (Limited)
                         </button>
                      </div>
                    )}
                 </form>
              </div>

              {/* User List with Search & Filter */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                   <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Database ({authorizedUsers.length})</h3>
                </div>

                {/* Search & Filter Toolbar */}
                <div className="flex flex-col gap-3 mb-4 bg-neutral-900/50 p-3 rounded-xl border border-neutral-800">
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Search users..."
                      value={adminSearchTerm}
                      onChange={e => setAdminSearchTerm(e.target.value)}
                      className="w-full bg-black border border-neutral-700 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-red-500 outline-none text-gray-200 placeholder-gray-600"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <div className="relative">
                      <select
                        value={adminFilterStatus}
                        onChange={(e) => setAdminFilterStatus(e.target.value as any)}
                        className="bg-black border border-neutral-700 rounded-lg pl-2 pr-6 py-1.5 focus:border-red-500 outline-none appearance-none cursor-pointer text-gray-300"
                      >
                        <option value="all">All Status</option>
                        <option value="active">Active Only</option>
                        <option value="inactive">Inactive Only</option>
                      </select>
                      <FilterIcon className="absolute right-2 top-2 w-3 h-3 text-gray-500 pointer-events-none" />
                    </div>

                    <div className="relative">
                       <select
                         value={adminFilterPlan}
                         onChange={(e) => setAdminFilterPlan(e.target.value as any)}
                         className="bg-black border border-neutral-700 rounded-lg pl-2 pr-6 py-1.5 focus:border-red-500 outline-none appearance-none cursor-pointer text-gray-300"
                       >
                         <option value="all">All Plans</option>
                         <option value="paid">Paid/Admin</option>
                         <option value="free">Free Trial</option>
                       </select>
                       <FilterIcon className="absolute right-2 top-2 w-3 h-3 text-gray-500 pointer-events-none" />
                    </div>

                    <div className="relative flex-1 min-w-[140px]">
                      <select
                        value={adminSortOption}
                        onChange={(e) => setAdminSortOption(e.target.value as any)}
                        className="w-full bg-black border border-neutral-700 rounded-lg pl-2 pr-6 py-1.5 focus:border-red-500 outline-none appearance-none cursor-pointer text-gray-300"
                      >
                        <option value="newest">Sort: Newest First</option>
                        <option value="oldest">Sort: Oldest First</option>
                        <option value="username">Sort: Username (A-Z)</option>
                        <option value="expiry">Sort: Expiry Date</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {filteredAndSortedUsers.length === 0 ? (
                    <div className="text-center py-8 text-neutral-600 text-sm bg-neutral-900/30 rounded-lg border border-neutral-800 border-dashed">
                      {authorizedUsers.length === 0 ? "No active subscriptions found." : "No users match your filters."}
                    </div>
                  ) : (
                    filteredAndSortedUsers.map(u => (
                      <div key={u.username} className={`flex flex-col md:flex-row md:items-center justify-between bg-neutral-800/40 p-3 rounded-lg border transition-colors ${u.isActive ? 'border-neutral-800' : 'border-red-900/30 bg-red-950/10'}`}>
                        <div className="flex items-center gap-3 mb-2 md:mb-0">
                          <div className={`w-2 h-2 rounded-full ${u.isActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-red-500'}`}></div>
                          <div>
                             <div className="font-medium text-sm text-gray-200 flex items-center gap-2">
                               {u.username}
                               {u.isUnlimited ? 
                                 <span title="Unlimited"><InfinityIcon className="w-3 h-3 text-yellow-500" /></span> :
                                 u.isFreeTrial && <span className="text-[10px] bg-green-900/30 text-green-500 px-1 rounded border border-green-900/50">FREE</span>
                               }
                             </div>
                             <div className="text-[10px] text-neutral-500 flex flex-wrap gap-2 items-center">
                               <span>
                                 {u.isActive ? 'Active' : 'Inactive'}
                               </span>
                               <span className="w-1 h-1 bg-neutral-700 rounded-full"></span>
                               <span>
                                 {u.expiryDate 
                                   ? `Exp: ${new Date(u.expiryDate).toLocaleDateString()}` 
                                   : 'Permanent'}
                               </span>
                               {u.deviceId && (
                                 <>
                                   <span className="w-1 h-1 bg-neutral-700 rounded-full"></span>
                                   <span className="flex items-center gap-1 text-neutral-400" title="Device Linked">
                                     <SmartphoneIcon className="w-3 h-3" /> Linked
                                   </span>
                                 </>
                               )}
                             </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 self-end md:self-auto">
                           {/* Unlink Device Button */}
                           {u.deviceId && (
                             <button
                               onClick={() => unlinkDevice(u.username)}
                               className="p-1.5 rounded-md text-orange-400 hover:text-orange-300 border border-transparent hover:border-orange-900/30 hover:bg-orange-900/20 transition-colors"
                               title="Unlink Device (Allow Login on new device)"
                             >
                               <LinkBreakIcon className="w-4 h-4" />
                             </button>
                           )}

                           <button
                             onClick={(e) => handleViewUser(e, u)}
                             className="p-1.5 rounded-md text-blue-400 hover:text-blue-300 border border-transparent hover:border-blue-900/30 hover:bg-blue-900/20 transition-colors"
                             title="View Details"
                           >
                              <InfoIcon className="w-4 h-4" />
                           </button>

                           <button 
                             onClick={() => handleEditClick(u)}
                             className="p-1.5 rounded-md text-neutral-400 hover:text-white border border-transparent hover:border-neutral-700 hover:bg-neutral-700/50 transition-colors"
                             title="Edit User"
                          >
                             <EditIcon className="w-4 h-4" />
                          </button>

                          <button 
                             onClick={() => toggleUserStatus(u.username)}
                             className={`p-1.5 rounded-md transition-colors border ${u.isActive ? 'text-green-500 border-green-900/30 hover:bg-green-900/20' : 'text-yellow-500 border-yellow-900/30 hover:bg-yellow-900/20'}`}
                             title={u.isActive ? "Deactivate User" : "Activate User"}
                          >
                             <PowerIcon className="w-4 h-4" />
                          </button>
                          
                          <button 
                            onClick={(e) => initiateDeleteUser(e, u.username)}
                            className="p-1.5 rounded-md text-neutral-500 hover:text-red-500 border border-transparent hover:border-red-900/30 hover:bg-red-900/20 transition-colors"
                            title="Delete User"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Detail View Modal */}
      {viewingUser && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
           <div className="w-full max-w-sm bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl p-6 relative">
              <button onClick={() => setViewingUser(null)} className="absolute top-4 right-4 text-gray-500 hover:text-white">
                <XIcon className="w-6 h-6" />
              </button>
              
              <div className="flex flex-col items-center mb-6">
                <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mb-3 border border-neutral-700">
                  <UserIcon className="w-8 h-8 text-neutral-300" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  {viewingUser.username === user ? 'My Subscription' : viewingUser.username}
                </h3>
                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold mt-1 ${viewingUser.isActive ? 'bg-green-900/30 text-green-500' : 'bg-red-900/30 text-red-500'}`}>
                  {viewingUser.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="space-y-4">
                <div className="bg-black/50 p-3 rounded-lg flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Messages Sent</span>
                  <span className="text-white font-mono font-bold">{getUserMessageCount(viewingUser.username)}</span>
                </div>
                
                <div className="bg-black/50 p-3 rounded-lg flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Plan Type</span>
                  <span className="text-white font-mono font-bold">
                    {viewingUser.isUnlimited ? <span className="flex items-center gap-1 text-yellow-500">VIP <InfinityIcon className="w-3 h-3"/></span> : 
                     viewingUser.isFreeTrial ? <span className="text-green-500">Free Trial</span> : 'Standard'}
                  </span>
                </div>

                <div className="bg-black/50 p-3 rounded-lg flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Expires</span>
                  <span className="text-white font-mono text-sm">
                     {viewingUser.expiryDate ? new Date(viewingUser.expiryDate).toLocaleDateString() : 'Never (Permanent)'}
                  </span>
                </div>
                
                <div className="bg-black/50 p-3 rounded-lg flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Device Status</span>
                  <span className="text-white font-mono text-sm flex items-center gap-2">
                     {viewingUser.deviceId ? <><SmartphoneIcon className="w-4 h-4 text-green-500"/> Linked</> : 'Unlinked'}
                  </span>
                </div>

                <div className="bg-black/50 p-3 rounded-lg flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Days Active</span>
                  <span className="text-white font-mono text-sm">
                     {Math.floor((Date.now() - viewingUser.createdAt) / (1000 * 60 * 60 * 24))} Days
                  </span>
                </div>
              </div>
           </div>
        </div>
      )}

      {/* Header */}
      <header className="flex-none h-16 border-b border-red-900/30 bg-black/80 backdrop-blur-md z-10 flex items-center justify-between px-4 md:px-8 relative">
        <div className="flex items-center gap-3 md:gap-4">
          <div 
            onClick={handleHeaderProfileClick}
            className="p-2 bg-gradient-to-tr from-red-600 to-red-800 rounded-lg shadow-[0_0_15px_rgba(220,38,38,0.3)] cursor-pointer hover:scale-105 transition-transform"
            title="View My Profile"
          >
            <BotIcon className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white hidden md:block">ABOOD AI <span className="text-red-600">PRO</span></h1>
            <div className="flex items-center gap-2">
              <span className={`relative flex h-2 w-2 ${isUnlimited ? 'text-yellow-500' : 'text-red-500'}`}>
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isUnlimited ? 'bg-yellow-400' : 'bg-red-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isUnlimited ? 'bg-yellow-500' : 'bg-red-500'}`}></span>
              </span>
              <span className={`text-xs font-medium truncate max-w-[120px] ${isUnlimited ? 'text-yellow-500 font-bold' : 'text-gray-400'}`}>
                {user} {isSuperAdmin ? '(ADMIN)' : isUnlimited ? '(VIP)' : ''}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
          {/* Admin Toggle - Only for Super Admin */}
          {isSuperAdmin && (
             <button
               onClick={() => setShowAdminPanel(true)}
               className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-red-900/50 text-red-400 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
             >
               <UsersIcon className="w-4 h-4" />
               <span className="hidden md:inline">Manage Access</span>
             </button>
          )}

          {/* Usage Counter */}
          <div className="flex flex-col items-end mr-2">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
               {currentUserData?.expiryDate 
                 ? `Exp: ${new Date(currentUserData.expiryDate).toLocaleDateString()}` 
                 : 'Daily Limit'}
            </div>
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${isLimitReached ? 'bg-red-600' : isUnlimited ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: isUnlimited ? '100%' : `${Math.min(100, (messageCount / MAX_MESSAGES) * 100)}%` }}
                />
              </div>
              <span className={`text-xs font-mono ${isLimitReached ? 'text-red-500 font-bold' : 'text-gray-300'}`}>
                {isUnlimited ? <InfinityIcon className="w-3 h-3" /> : `${messageCount}/${MAX_MESSAGES}`}
              </span>
            </div>
          </div>

          <div className="h-8 w-[1px] bg-neutral-800 mx-1"></div>

          <button 
            onClick={() => setViewingUser(currentUserData)}
            className="p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-neutral-900"
            title="Subscription Info"
          >
            <InfoIcon className="w-5 h-5" />
          </button>

          <button 
            onClick={handleClearChat}
            className="p-2 text-gray-500 hover:text-white transition-colors rounded-full hover:bg-neutral-900"
            title="Clear Chat"
          >
            <TrashIcon className="w-5 h-5" />
          </button>
          
          <button 
            onClick={handleLogout}
            className="p-2 text-red-500 hover:text-red-400 transition-colors rounded-full hover:bg-red-950/30"
            title="Logout"
          >
            <LogOutIcon className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 scroll-smooth custom-scrollbar relative z-10">
        <div className={`max-w-4xl mx-auto space-y-6 min-h-full flex flex-col pb-4 ${hasUserMessages ? 'justify-end' : 'justify-center'}`}>
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          
          {/* Conversation Rules - Show only when no user messages exist */}
          {!hasUserMessages && (
             <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 animate-fade-in w-full">
                <div className="bg-neutral-900/80 border border-red-900/30 p-6 rounded-2xl max-w-lg w-full backdrop-blur-md shadow-[0_0_30px_rgba(220,38,38,0.05)]">
                    <div className="flex items-center justify-center gap-2 mb-6 border-b border-red-900/30 pb-4">
                      <ShieldCheckIcon className="w-6 h-6 text-red-600" />
                      <h3 className="text-red-500 font-bold text-center text-lg">
                        قوانين المحادثة
                      </h3>
                    </div>
                    <ul className="space-y-4 text-right" dir="rtl">
                       {CHAT_RULES.map((rule, index) => (
                         <li key={index} className="flex items-center gap-3 text-gray-300 text-sm group">
                            <span className="p-1 bg-red-900/20 rounded-full group-hover:bg-red-900/40 transition-colors">
                              <CheckSmallIcon className="w-4 h-4 text-red-500" />
                            </span>
                            <span className="font-medium">{rule}</span>
                         </li>
                       ))}
                    </ul>
                </div>
             </div>
          )}
          
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </main>

      {/* Floating Complaint Button */}
      <div className="absolute bottom-24 left-4 md:left-8 z-30">
        <button 
          onClick={() => setShowComplaintModal(true)}
          className="p-2 bg-neutral-900/50 hover:bg-neutral-800 text-neutral-600 hover:text-yellow-500 rounded-full transition-all border border-transparent hover:border-yellow-900/30"
          title="Report Issue"
        >
          <MailWarningIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Input Area */}
      <footer className="flex-none p-4 md:p-6 bg-black border-t border-red-900/20 relative z-20">
        <div className="max-w-4xl mx-auto relative">
          {isLimitReached ? (
             <div className="flex items-center justify-center p-4 bg-red-950/20 border border-red-900/50 rounded-2xl">
               <div className="text-center">
                 <p className="text-red-500 font-bold mb-1">Daily Limit Reached</p>
                 <p className="text-red-400/60 text-xs">You have used all 10 available messages for user "{user}".</p>
               </div>
             </div>
          ) : (
            <form 
              onSubmit={handleSubmit}
              className="relative flex items-end gap-2 bg-neutral-900/80 backdrop-blur p-2 rounded-2xl border border-red-900/30 focus-within:border-red-600 focus-within:ring-1 focus-within:ring-red-600/50 transition-all duration-300 shadow-[0_0_20px_rgba(0,0,0,0.5)]"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message here... / اكتب رسالتك هنا"
                className="w-full bg-transparent text-white placeholder-gray-500 px-4 py-3 min-h-[52px] max-h-32 focus:outline-none resize-none"
                disabled={isLoading}
                dir="auto"
              />
              
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className={`p-3 rounded-xl flex items-center justify-center transition-all duration-300
                  ${input.trim() && !isLoading 
                    ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] hover:bg-red-500 hover:shadow-[0_0_20px_rgba(220,38,38,0.6)] transform hover:-translate-y-0.5' 
                    : 'bg-neutral-800 text-gray-600 cursor-not-allowed'
                  }`}
              >
                {isLoading ? (
                  <LoadingSpinner className="w-5 h-5 text-white/80" />
                ) : (
                  <SendIcon className="w-5 h-5" />
                )}
              </button>
            </form>
          )}
          <div className="text-center mt-2 flex justify-between px-2 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">
            <span>ABOOD AI v2.0</span>
            <span>{isUnlimited ? 'Unlimited Access' : `${remaining} Credits Left`}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
