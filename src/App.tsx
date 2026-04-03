/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { Upload, Brain, AlertTriangle, HelpCircle, X, TrendingUp, TrendingDown, Minus, Settings, Activity, ShieldAlert, Info, Trash2, Loader2, CheckCircle2, XCircle, Trophy, Target, Wallet, BarChart3, LineChart as LineChartIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { resizeImage } from './lib/imageUtils';

interface Reason {
  text: string;
  contribution: 'Tài' | 'Xỉu' | 'Neutral';
}

interface AnalysisResult {
  suggestion: 'Tài' | 'Xỉu';
  reasons: Reason[];
  confidenceScore: number;
  detectedPattern?: string;
  timestamp?: number;
  imageUrl?: string;
  status?: 'Win' | 'Loss' | 'Pending';
  betSuggestion?: {
    amount: number;
    percentage: number;
    riskLevel: 'Low' | 'Medium' | 'High' | 'Extreme';
  };
}

const PATTERNS = [
  { name: 'Cầu Bệt', desc: 'Chuỗi liên tiếp 1 bên (Tài hoặc Xỉu) kéo dài từ 4-10 ván.', color: 'text-red-500' },
  { name: 'Cầu 1-1', desc: 'Luân phiên Tài - Xỉu - Tài - Xỉu liên tục.', color: 'text-cyan-400' },
  { name: 'Cầu 2-2', desc: 'Hai ván Tài, hai ván Xỉu lặp lại.', color: 'text-fuchsia-400' },
  { name: 'Cầu Đảo', desc: 'Mẫu hình thay đổi đột ngột sau một chuỗi dài.', color: 'text-amber-400' }
];

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'Focus' | 'Pro'>('Pro');
  const [activeTab, setActiveTab] = useState<'analyze' | 'settings' | 'history' | 'patterns'>('analyze');
  const [toast, setToast] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [settings, setSettings] = useState({
    volume: 0.5,
    toastEnabled: true,
    preferredPatterns: 'Cầu bệt',
    theme: 'Neon' as 'Neon' | 'Cyber',
    balance: 1000000, // Default 1M VND
  });

  const updateStatus = (timestamp: number, status: 'Win' | 'Loss') => {
    setHistory(prev => prev.map(item => 
      item.timestamp === timestamp ? { ...item, status } : item
    ));
    showToast(status === 'Win' ? "Chúc mừng! Bạn đã thắng ván này." : "Rất tiếc! Hãy thử lại ván sau.");
    playSound(status === 'Win' ? 'success' : 'error');
  };

  const calculateStats = () => {
    const total = history.filter(h => h.status).length;
    const wins = history.filter(h => h.status === 'Win').length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    return { total, wins, winRate };
  };

  const showToast = (message: string) => {
    if (!settings.toastEnabled) return;
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLoading(true);
      setError(null);
      
      // Use FileReader for better compatibility on some mobile browsers
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          setImage(result);
          setAnalysis(null);
          setLoading(false);
          showToast("Đã nạp ảnh thành công!");
        }
      };
      reader.onerror = () => {
        setError("Không thể đọc file ảnh. Vui lòng thử lại.");
        setLoading(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const playSound = (type: 'success' | 'error') => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      gainNode.gain.value = settings.volume;

      if (type === 'success') {
        oscillator.frequency.value = 600;
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.2);
      } else {
        oscillator.frequency.value = 200;
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.4);
      }
    } catch (e) {
      console.error("Sound playback failed:", e);
    }
  };

  const analyzeImage = async () => {
    if (!image) return;
    setLoading(true);
    setLoadingStep("Đang chuẩn bị dữ liệu...");
    setAnalysis(null);
    setError(null);

    const timeoutId = setTimeout(() => {
      if (loading) {
        setLoadingStep("Hệ thống đang phản hồi chậm, vui lòng kiên nhẫn...");
      }
    }, 10000);

    try {
      // Robust API key detection following baseline
      const apiKey = process.env.GEMINI_API_KEY || "";

      if (!apiKey || apiKey === "undefined" || apiKey.trim() === "") {
        throw new Error("Lỗi: Chưa cấu hình API Key. Vui lòng kiểm tra lại môi trường.");
      }

      const ai = new GoogleGenAI({ apiKey });
      
      setLoadingStep("Đang tối ưu hóa hình ảnh...");
      // Use a smaller dimension (512px) for much faster processing on mobile
      const resizedImage = await resizeImage(image, 512, 512);
      const base64Data = resizedImage.split(',')[1];
      
      if (!base64Data) {
        throw new Error("Dữ liệu ảnh không hợp lệ.");
      }

      setLoadingStep("Đang gửi dữ liệu lên Neural Network...");
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: {
          parts: [
            { text: `Phân tích cầu Tài Xỉu (ưu tiên '${settings.preferredPatterns}'). Trả về JSON: suggestion (Tài/Xỉu), confidenceScore (0-1), detectedPattern (tên mẫu hình nếu có, ví dụ: 'Cầu Bệt', 'Cầu 1-1', 'Cầu 2-2', 'Cầu Đảo'), reasons (mảng 3 đối tượng {text, contribution}).` },
            { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
          ]
        },
        config: {
          systemInstruction: "Bạn là AI nhận diện cầu Tài Xỉu siêu tốc. Chỉ trả về JSON.",
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestion: { type: Type.STRING, description: "Tài hoặc Xỉu" },
              detectedPattern: { type: Type.STRING, description: "Tên mẫu hình nhận diện được" },
              reasons: { 
                type: Type.ARRAY, 
                items: { 
                  type: Type.OBJECT, 
                  properties: {
                    text: { type: Type.STRING, description: "Từ khóa lý do" },
                    contribution: { type: Type.STRING, enum: ['Tài', 'Xỉu', 'Neutral'], description: "Đóng góp cho Tài, Xỉu hoặc Neutral" }
                  },
                  required: ["text", "contribution"]
                },
                description: "3 từ khóa lý do chính" 
              },
              confidenceScore: { type: Type.NUMBER, description: "Điểm tự tin từ 0 đến 1" }
            },
            required: ["suggestion", "reasons", "confidenceScore"]
          }
        }
      });
      
      setLoadingStep("Đang giải mã kết quả AI...");
      if (!response.text) {
        throw new Error("AI_NO_RESPONSE");
      }

      try {
        const result = JSON.parse(response.text) as AnalysisResult;
        
        // Basic validation of the result
        if (!result.suggestion || !result.reasons || result.reasons.length === 0) {
          throw new Error("AI_INVALID_FORMAT");
        }

        // Calculate Bet Suggestion
        let percentage = 0;
        let riskLevel: 'Low' | 'Medium' | 'High' | 'Extreme' = 'Low';

        if (result.confidenceScore >= 0.95) {
          percentage = 10;
          riskLevel = 'Extreme';
        } else if (result.confidenceScore >= 0.85) {
          percentage = 5;
          riskLevel = 'High';
        } else if (result.confidenceScore >= 0.75) {
          percentage = 3;
          riskLevel = 'Medium';
        } else {
          percentage = 1;
          riskLevel = 'Low';
        }

        result.betSuggestion = {
          amount: Math.floor(settings.balance * (percentage / 100)),
          percentage,
          riskLevel
        };

        result.timestamp = Date.now();
        result.imageUrl = image;
        result.status = 'Pending';
        setAnalysis(result);
        setHistory(prev => [result, ...prev].slice(0, 10)); // Keep last 10
      } catch (parseErr: any) {
        if (parseErr.message === "AI_INVALID_FORMAT") throw parseErr;
        console.error("JSON Parse Error:", parseErr, response.text);
        throw new Error("AI_PARSE_ERROR");
      }
      
      playSound('success');
      showToast("Phân tích thành công!");
    } catch (err: any) {
      console.error("Analysis Error Details:", err);
      let msg = "Lỗi phân tích hình ảnh. Vui lòng thử lại.";
      
      if (err.message?.includes("API Key")) {
        msg = "Chưa cấu hình API Key. Vui lòng kiểm tra lại cài đặt hệ thống.";
      } else if (err.message === "AI_NO_RESPONSE") {
        msg = "AI không thể đọc được dữ liệu từ ảnh này. Ảnh có thể quá mờ hoặc không chứa bảng kết quả.";
      } else if (err.message === "AI_INVALID_FORMAT" || err.message === "AI_PARSE_ERROR") {
        msg = "AI nhận diện được dữ liệu nhưng không thể phân tích mẫu hình rõ ràng. Vui lòng chụp ảnh chính diện và rõ nét hơn.";
      } else if (err.message?.includes("quota")) {
        msg = "Hệ thống đang quá tải (hết quota). Vui lòng đợi 1-2 phút rồi thử lại.";
      } else if (err.message?.includes("safety")) {
        msg = "Ảnh bị từ chối vì lý do an toàn hoặc nội dung không phù hợp. Hãy đảm bảo ảnh chỉ chứa bảng kết quả Tài Xỉu.";
      } else if (err.message) {
        msg = err.message;
      }
      
      setError(msg);
      playSound('error');
      showToast("Lỗi phân tích!");
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
      setLoadingStep("");
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-cyan-500/30 selection:text-cyan-200 overflow-x-hidden p-4 md:p-8">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-cyan-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-fuchsia-500/10 rounded-full blur-[120px] animate-pulse delay-700" />
        <div className="absolute -bottom-[10%] left-[20%] w-[50%] h-[50%] bg-blue-600/5 rounded-full blur-[120px] animate-pulse delay-1000" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
        <div className="absolute inset-0 bg-[grid-white_0.02] [mask-image:radial-gradient(white,transparent_85%)]" />
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 right-6 bg-slate-900/90 backdrop-blur-md border border-cyan-500/30 text-cyan-400 px-6 py-3 rounded-xl shadow-2xl shadow-cyan-500/10 z-[100] flex items-center gap-3"
          >
            <Activity size={18} className="animate-pulse" />
            <span className="font-semibold">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGuide && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-2xl z-[100] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-slate-900/80 border border-white/10 rounded-[2.5rem] p-8 md:p-12 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative"
            >
              <div className="flex justify-between items-center mb-12">
                <div className="flex items-center gap-5">
                  <div className="p-4 bg-cyan-500/10 rounded-2xl border border-cyan-500/20">
                    <HelpCircle className="text-cyan-400 w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black text-white tracking-tight">Hướng dẫn</h2>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">User Manual</p>
                  </div>
                </div>
                <button onClick={() => setShowGuide(false)} className="p-3 bg-white/5 hover:bg-white/10 rounded-full transition-all text-slate-400 hover:text-white active:scale-90"><X size={24} /></button>
              </div>
              
              <div className="space-y-12 text-slate-300">
                <section className="relative pl-8 border-l-2 border-cyan-500/20">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]" />
                  <h3 className="text-xl font-black text-white mb-4 flex items-center gap-3 tracking-tight">
                    <Upload size={20} className="text-cyan-400" /> 1. Nạp dữ liệu
                  </h3>
                  <p className="leading-relaxed text-slate-400 font-medium">Tải ảnh chụp màn hình lịch sử cầu hoặc sử dụng camera để chụp trực tiếp. AI sẽ quét các điểm dữ liệu và nhận diện chuỗi số.</p>
                </section>

                <section className="relative pl-8 border-l-2 border-fuchsia-500/20">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-fuchsia-500 shadow-[0_0_10px_rgba(217,70,239,0.5)]" />
                  <h3 className="text-xl font-black text-white mb-4 flex items-center gap-3 tracking-tight">
                    <Activity size={20} className="text-fuchsia-400" /> 2. Chế độ hiển thị
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-white/[0.03] p-5 rounded-2xl border border-white/5">
                      <h4 className="font-black text-cyan-400 text-xs uppercase tracking-widest mb-2">Focus Mode</h4>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">Tối giản, chỉ hiển thị kết quả Tài/Xỉu để quyết định nhanh.</p>
                    </div>
                    <div className="bg-white/[0.03] p-5 rounded-2xl border border-white/5">
                      <h4 className="font-black text-fuchsia-400 text-xs uppercase tracking-widest mb-2">Pro Mode</h4>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">Chi tiết, hiển thị độ tin cậy, lý do kỹ thuật và mẫu hình.</p>
                    </div>
                  </div>
                </section>

                <section className="relative pl-8 border-l-2 border-slate-500/20">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-500" />
                  <h3 className="text-xl font-black text-white mb-4 flex items-center gap-3 tracking-tight">
                    <Brain size={20} className="text-slate-400" /> 3. Phân tích mẫu hình
                  </h3>
                  <div className="space-y-3">
                    {[
                      { icon: <TrendingUp className="text-red-500" />, label: 'Ủng hộ Tài', desc: 'Các chỉ số toán học nghiêng về kết quả lớn.' },
                      { icon: <TrendingDown className="text-cyan-400" />, label: 'Ủng hộ Xỉu', desc: 'Các chỉ số toán học nghiêng về kết quả nhỏ.' },
                      { icon: <Minus className="text-slate-500" />, label: 'Trung lập', desc: 'Yếu tố không ảnh hưởng rõ rệt đến xu hướng.' }
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-4 bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                        <div className="p-2 bg-slate-800/50 rounded-xl">{item.icon}</div>
                        <div>
                          <p className="text-sm font-bold text-white tracking-tight">{item.label}</p>
                          <p className="text-[10px] text-slate-500 font-medium">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="mb-8 md:mb-16 text-center flex flex-col items-center relative z-10">
        <motion.button 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowGuide(true)} 
          className="absolute right-0 top-0 p-2 text-slate-500 hover:text-cyan-400 transition-colors"
        >
          <HelpCircle size={24} md:size={28} />
        </motion.button>
        
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mb-8 md:mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-4">
            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-ping" />
            <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">AI Engine v3.1 Live</span>
          </div>
          <h1 className="text-5xl md:text-8xl font-black text-white tracking-tighter mb-4 leading-none">
            <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-slate-500">PATTERN</span>
            <br />
            <span className="text-cyan-500 drop-shadow-[0_0_15px_rgba(6,182,212,0.5)]">ANALYZER</span>
          </h1>
          <p className="text-slate-500 font-medium max-w-md mx-auto text-sm md:text-base">Hệ thống nhận diện mẫu hình toán học và dự đoán xác suất Tài Xỉu thời gian thực.</p>
        </motion.div>

        <div className="flex flex-col gap-4 items-center w-full max-w-2xl">
          <div className="bg-slate-900/40 backdrop-blur-2xl p-1.5 rounded-3xl flex w-full gap-1 border border-white/5 shadow-2xl overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setActiveTab('analyze')}
              className={`relative flex-1 py-3 px-6 rounded-2xl text-xs md:text-sm font-black transition-all duration-500 whitespace-nowrap ${activeTab === 'analyze' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {activeTab === 'analyze' && (
                <motion.div layoutId="tab-bg" className="absolute inset-0 bg-white/5 rounded-2xl -z-10 border border-white/10" />
              )}
              <div className="flex items-center justify-center gap-2.5">
                <Activity size={16} className={activeTab === 'analyze' ? 'text-cyan-400' : ''} /> PHÂN TÍCH
              </div>
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`relative flex-1 py-3 px-6 rounded-2xl text-xs md:text-sm font-black transition-all duration-500 whitespace-nowrap ${activeTab === 'history' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {activeTab === 'history' && (
                <motion.div layoutId="tab-bg" className="absolute inset-0 bg-white/5 rounded-2xl -z-10 border border-white/10" />
              )}
              <div className="flex items-center justify-center gap-2.5">
                <ShieldAlert size={16} className={activeTab === 'history' ? 'text-cyan-400' : ''} /> LỊCH SỬ
              </div>
            </button>
            <button 
              onClick={() => setActiveTab('patterns')}
              className={`relative flex-1 py-3 px-6 rounded-2xl text-xs md:text-sm font-black transition-all duration-500 whitespace-nowrap ${activeTab === 'patterns' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {activeTab === 'patterns' && (
                <motion.div layoutId="tab-bg" className="absolute inset-0 bg-white/5 rounded-2xl -z-10 border border-white/10" />
              )}
              <div className="flex items-center justify-center gap-2.5">
                <Brain size={16} className={activeTab === 'patterns' ? 'text-cyan-400' : ''} /> MẪU HÌNH
              </div>
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`relative flex-1 py-3 px-6 rounded-2xl text-xs md:text-sm font-black transition-all duration-500 whitespace-nowrap ${activeTab === 'settings' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {activeTab === 'settings' && (
                <motion.div layoutId="tab-bg" className="absolute inset-0 bg-white/5 rounded-2xl -z-10 border border-white/10" />
              )}
              <div className="flex items-center justify-center gap-2.5">
                <Settings size={16} className={activeTab === 'settings' ? 'text-cyan-400' : ''} /> CÀI ĐẶT
              </div>
            </button>
          </div>

          <div className="bg-slate-900/40 backdrop-blur-2xl p-1.5 rounded-2xl flex w-full gap-1 border border-white/5 shadow-2xl">
            <button 
              onClick={() => setMode('Focus')}
              className={`relative flex-1 py-2.5 rounded-xl text-xs md:text-sm font-black transition-all duration-500 ${mode === 'Focus' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {mode === 'Focus' && (
                <motion.div layoutId="mode-bg" className="absolute inset-0 bg-cyan-500/10 rounded-xl -z-10 border border-cyan-500/20" />
              )}
              FOCUS
            </button>
            <button 
              onClick={() => setMode('Pro')}
              className={`relative flex-1 py-2.5 rounded-xl text-xs md:text-sm font-black transition-all duration-500 ${mode === 'Pro' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {mode === 'Pro' && (
                <motion.div layoutId="mode-bg" className="absolute inset-0 bg-cyan-500/10 rounded-xl -z-10 border border-cyan-500/20" />
              )}
              PRO
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <motion.div 
          layout
          className={`max-w-6xl mx-auto ${activeTab === 'analyze' ? `grid gap-8 ${mode === 'Focus' ? 'md:grid-cols-1 max-w-2xl' : 'lg:grid-cols-12'}` : ''}`}
        >
          {activeTab === 'history' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-900/40 backdrop-blur-2xl p-8 md:p-12 rounded-[2.5rem] shadow-2xl border border-white/5 max-w-4xl mx-auto w-full"
            >
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-5">
                  <div className="p-4 bg-cyan-500/10 rounded-2xl border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                    <ShieldAlert className="w-8 h-8 text-cyan-400" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black text-white tracking-tight">Lịch sử phiên</h2>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Session Logs</p>
                  </div>
                </div>
                {history.length > 0 && (
                  <button 
                    onClick={() => {
                      setHistory([]);
                      showToast("Đã xóa toàn bộ lịch sử phân tích");
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-all text-[10px] font-black uppercase tracking-widest active:scale-95"
                  >
                    <Trash2 size={14} />
                    Xóa hết
                  </button>
                )}
              </div>

              {history.length > 0 && (
                <div className="space-y-10">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white/[0.02] p-6 rounded-3xl border border-white/5 text-center">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <Target size={14} className="text-slate-500" />
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tổng số</p>
                      </div>
                      <p className="text-3xl font-black text-white font-mono">{calculateStats().total}</p>
                    </div>
                    <div className="bg-green-500/5 p-6 rounded-3xl border border-green-500/10 text-center">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <Trophy size={14} className="text-green-500" />
                        <p className="text-[10px] font-black text-green-500 uppercase tracking-widest">Thắng</p>
                      </div>
                      <p className="text-3xl font-black text-green-500 font-mono">{calculateStats().wins}</p>
                    </div>
                    <div className="bg-cyan-500/5 p-6 rounded-3xl border border-cyan-500/10 text-center">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <Activity size={14} className="text-cyan-400" />
                        <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Tỉ lệ</p>
                      </div>
                      <p className="text-3xl font-black text-cyan-400 font-mono">{calculateStats().winRate.toFixed(0)}%</p>
                    </div>
                  </div>

                  {/* Trend Analytics Chart */}
                  <div className="bg-white/[0.02] p-8 rounded-[2.5rem] border border-white/5">
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-fuchsia-500/10 rounded-xl">
                          <BarChart3 className="w-5 h-5 text-fuchsia-400" />
                        </div>
                        <div>
                          <h4 className="text-lg font-black text-white tracking-tight">Biểu đồ xu hướng</h4>
                          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Confidence Trend</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={[...history].reverse()}>
                          <defs>
                            <linearGradient id="colorConf" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                          <XAxis 
                            dataKey="timestamp" 
                            hide 
                          />
                          <YAxis 
                            domain={[0, 1]} 
                            stroke="#475569" 
                            fontSize={10} 
                            tickFormatter={(val) => `${(val * 100).toFixed(0)}%`}
                          />
                          <Tooltip 
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload as AnalysisResult;
                                return (
                                  <div className="bg-slate-900/90 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-2xl">
                                    <p className="text-[10px] font-black text-slate-500 uppercase mb-2">
                                      {new Date(data.timestamp!).toLocaleTimeString()}
                                    </p>
                                    <div className="flex items-center gap-3">
                                      <div className={`w-2 h-2 rounded-full ${data.suggestion === 'Tài' ? 'bg-red-500' : 'bg-cyan-400'}`} />
                                      <p className="text-sm font-black text-white">{data.suggestion}</p>
                                      <p className="text-xs font-mono text-cyan-400">{(data.confidenceScore * 100).toFixed(0)}%</p>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="confidenceScore" 
                            stroke="#06b6d4" 
                            strokeWidth={3}
                            fillOpacity={1} 
                            fill="url(#colorConf)" 
                            animationDuration={2000}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
              
              {history.length === 0 ? (
                <div className="text-center py-24 bg-white/[0.02] rounded-[2rem] border border-dashed border-white/5">
                  <div className="w-16 h-16 bg-slate-800/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <ShieldAlert className="text-slate-600" size={32} />
                  </div>
                  <p className="text-slate-500 font-bold tracking-tight">Chưa có dữ liệu phân tích trong phiên này.</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {history.map((item, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0, transition: { delay: idx * 0.05 } }}
                      className="bg-white/[0.02] p-5 rounded-2xl border border-white/5 flex items-center justify-between gap-4 hover:bg-white/[0.04] hover:border-white/10 transition-all group relative"
                    >
                      {/* Tooltip */}
                      <div className="absolute bottom-[110%] left-1/2 -translate-x-1/2 w-72 p-4 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-50 scale-95 group-hover:scale-100 origin-bottom">
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/5">
                          <Info size={12} className="text-cyan-400" />
                          <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Metadata Details</span>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase mb-0.5">Timestamp</p>
                            <p className="text-[10px] text-slate-300 font-mono">{new Date(item.timestamp!).toLocaleString('vi-VN')}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase mb-0.5">Source URL (Base64)</p>
                            <p className="text-[9px] text-slate-400 font-mono break-all line-clamp-3 bg-black/20 p-1.5 rounded-lg border border-white/5">
                              {item.imageUrl}
                            </p>
                          </div>
                        </div>
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 border-r border-b border-white/10 rotate-45" />
                      </div>

                      <div className="flex items-center gap-5">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-lg shadow-2xl ${item.suggestion === 'Tài' ? 'bg-red-500/20 text-red-500' : 'bg-cyan-500/20 text-cyan-400'}`}>
                          {item.suggestion[0]}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-white font-black tracking-tight">{item.suggestion}</p>
                            <span className="text-[10px] font-black text-slate-500">•</span>
                            <p className="text-cyan-400 font-mono text-xs">{(item.confidenceScore * 100).toFixed(0)}%</p>
                          </div>
                          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{new Date(item.timestamp!).toLocaleTimeString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {item.status === 'Pending' ? (
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => updateStatus(item.timestamp!, 'Win')}
                              className="p-2.5 rounded-xl bg-green-500/10 text-green-500 hover:bg-green-500/20 border border-green-500/20 transition-all active:scale-95"
                              title="Đánh dấu Thắng"
                            >
                              <CheckCircle2 size={18} />
                            </button>
                            <button 
                              onClick={() => updateStatus(item.timestamp!, 'Loss')}
                              className="p-2.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 transition-all active:scale-95"
                              title="Đánh dấu Thua"
                            >
                              <XCircle size={18} />
                            </button>
                          </div>
                        ) : (
                          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-black text-[10px] uppercase tracking-widest ${item.status === 'Win' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
                            {item.status === 'Win' ? <Trophy size={12} /> : <XCircle size={12} />}
                            {item.status}
                          </div>
                        )}
                        <button 
                          onClick={() => {
                            setAnalysis(item);
                            setImage(item.imageUrl!);
                            setActiveTab('analyze');
                          }}
                          className="px-5 py-2.5 rounded-xl bg-white/5 text-[10px] font-black text-white hover:bg-cyan-600 transition-all uppercase tracking-[0.2em] group-hover:scale-105 active:scale-95"
                        >
                          XEM LẠI
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'patterns' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-900/40 backdrop-blur-2xl p-8 md:p-12 rounded-[2.5rem] shadow-2xl border border-white/5 max-w-4xl mx-auto w-full"
            >
              <div className="flex items-center gap-5 mb-10">
                <div className="p-4 bg-fuchsia-500/10 rounded-2xl border border-fuchsia-500/20 shadow-[0_0_20px_rgba(217,70,239,0.15)]">
                  <Brain className="w-8 h-8 text-fuchsia-400" />
                </div>
                <div>
                  <h2 className="text-3xl font-black text-white tracking-tight">Thư viện mẫu hình</h2>
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Pattern Encyclopedia</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {PATTERNS.map((p, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1, transition: { delay: i * 0.1 } }}
                    className="bg-white/[0.02] p-8 rounded-[2rem] border border-white/5 hover:border-fuchsia-500/30 hover:bg-fuchsia-500/[0.02] transition-all group cursor-default"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h4 className={`text-2xl font-black tracking-tighter ${p.color}`}>{p.name}</h4>
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-fuchsia-500/20 transition-colors">
                        <TrendingUp size={16} className={p.color} />
                      </div>
                    </div>
                    <p className="text-slate-400 text-sm leading-relaxed font-medium">{p.desc}</p>
                    <div className="mt-6 pt-6 border-t border-white/5 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-500" />
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mathematical Model Detected</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-slate-900/40 backdrop-blur-2xl p-8 md:p-12 rounded-[2.5rem] shadow-2xl border border-white/5 max-w-2xl mx-auto w-full"
            >
              <div className="flex items-center gap-5 mb-12">
                <div className="p-4 bg-cyan-500/10 rounded-2xl border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                  <Settings className="w-8 h-8 text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-3xl font-black text-white tracking-tight">Cấu hình hệ thống</h2>
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">System Preferences</p>
                </div>
              </div>
              
              <div className="space-y-12">
                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Âm lượng hệ thống</label>
                      <p className="text-xs text-slate-400 mt-1">Điều chỉnh âm thanh phản hồi</p>
                    </div>
                    <span className="text-cyan-400 font-mono font-black text-xl">{(settings.volume * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.1" value={settings.volume} 
                    onChange={(e) => setSettings({...settings, volume: parseFloat(e.target.value)})}
                    className="w-full h-2 bg-slate-800 rounded-full appearance-none cursor-pointer accent-cyan-500"
                  />
                </div>
                
                <div className="flex items-center justify-between p-6 bg-white/[0.02] rounded-3xl border border-white/5 hover:bg-white/[0.04] transition-all">
                  <div className="space-y-1">
                    <label className="text-sm font-black text-white tracking-tight">Thông báo hệ thống</label>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Status Toasts</p>
                  </div>
                  <button 
                    onClick={() => setSettings({...settings, toastEnabled: !settings.toastEnabled})}
                    className={`w-14 h-7 rounded-full transition-all duration-500 relative ${settings.toastEnabled ? 'bg-cyan-600 shadow-[0_0_15px_rgba(8,145,178,0.4)]' : 'bg-slate-800'}`}
                  >
                    <motion.div 
                      animate={{ x: settings.toastEnabled ? 32 : 4 }}
                      className="absolute top-1.5 w-4 h-4 bg-white rounded-full shadow-xl"
                    />
                  </button>
                </div>
                
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Mẫu hình ưu tiên</label>
                    <p className="text-xs text-slate-400 mt-1">AI sẽ tập trung tìm kiếm mẫu hình này</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {['Cầu bệt', 'Cầu 1-1', 'Cầu 2-2', 'Cầu đảo'].map((p) => (
                      <button
                        key={p}
                        onClick={() => setSettings({...settings, preferredPatterns: p})}
                        className={`px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all duration-500 ${settings.preferredPatterns === p ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.1)]' : 'bg-white/[0.02] border-white/5 text-slate-500 hover:border-white/20 hover:text-slate-300'}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-6 pt-6 border-t border-white/5">
                  <div className="flex justify-between items-end">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-cyan-500/10 rounded-lg">
                        <Wallet size={16} className="text-cyan-400" />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Quản lý vốn (VND)</label>
                        <p className="text-xs text-slate-400 mt-1">Số dư khởi đầu để AI tính toán</p>
                      </div>
                    </div>
                    <span className="text-cyan-400 font-mono font-black text-xl">{settings.balance.toLocaleString('vi-VN')}</span>
                  </div>
                  <input 
                    type="range" min="100000" max="10000000" step="100000" value={settings.balance} 
                    onChange={(e) => setSettings({...settings, balance: parseInt(e.target.value)})}
                    className="w-full h-2 bg-slate-800 rounded-full appearance-none cursor-pointer accent-cyan-500"
                  />
                  <div className="flex justify-between text-[10px] font-black text-slate-600 uppercase tracking-widest">
                    <span>100K</span>
                    <span>10M</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'analyze' && (
            <>
              {/* Upload Section */}
              <motion.div 
                layout
                className={`bg-slate-900/40 backdrop-blur-2xl p-8 rounded-[2.5rem] shadow-2xl border border-white/5 ${mode === 'Pro' ? 'lg:col-span-5' : ''}`}
              >
                <div className="flex items-center gap-5 mb-10">
                  <div className="p-4 bg-cyan-500/10 rounded-2xl border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                    <Upload className="w-8 h-8 text-cyan-400" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-white tracking-tight">Dữ liệu đầu vào</h2>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">Input Source</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                  <div className="relative group">
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageUpload} 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="border-2 border-dashed border-white/5 group-hover:border-cyan-500/50 rounded-3xl p-8 transition-all duration-500 bg-white/[0.02] hover:bg-cyan-500/[0.02] text-center flex flex-col items-center justify-center h-full group-active:scale-95">
                      <div className="w-14 h-14 rounded-2xl bg-slate-800/50 flex items-center justify-center mb-4 group-hover:bg-cyan-500/20 transition-colors">
                        <Upload className="text-slate-500 group-hover:text-cyan-400 transition-colors" size={24} />
                      </div>
                      <p className="text-slate-400 font-bold text-sm tracking-tight">Tải ảnh lên</p>
                      <p className="text-[10px] text-slate-600 mt-1 uppercase font-black">Gallery</p>
                    </div>
                  </div>
                  
                  <div className="relative group">
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="environment"
                      onChange={handleImageUpload} 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="border-2 border-dashed border-white/5 group-hover:border-fuchsia-500/50 rounded-3xl p-8 transition-all duration-500 bg-white/[0.02] hover:bg-fuchsia-500/[0.02] text-center flex flex-col items-center justify-center h-full group-active:scale-95">
                      <div className="w-14 h-14 rounded-2xl bg-slate-800/50 flex items-center justify-center mb-4 group-hover:bg-fuchsia-500/20 transition-colors">
                        <Activity className="text-slate-500 group-hover:text-fuchsia-400 transition-colors" size={24} />
                      </div>
                      <p className="text-slate-400 font-bold text-sm tracking-tight">Chụp ảnh mới</p>
                      <p className="text-[10px] text-slate-600 mt-1 uppercase font-black">Camera</p>
                    </div>
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {image && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="space-y-8"
                    >
                      <div className="relative group overflow-hidden rounded-3xl border border-white/10 shadow-2xl aspect-video bg-slate-950">
                        <img 
                          src={image} 
                          alt="Uploaded" 
                          className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60" />
                        <div className="absolute inset-0 flex items-end p-6">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <p className="text-white text-[10px] font-black uppercase tracking-[0.2em]">Image Ready for Analysis</p>
                          </div>
                        </div>
                      </div>
                      
                      <button 
                        onClick={analyzeImage} 
                        disabled={loading}
                        className="relative w-full overflow-hidden group bg-cyan-600 text-white py-5 px-8 rounded-[1.5rem] font-black text-xl hover:bg-cyan-500 transition-all disabled:bg-slate-800 disabled:text-slate-600 shadow-[0_10px_30px_rgba(8,145,178,0.3)] active:scale-[0.98]"
                      >
                        <span className="relative z-10 tracking-tighter">{loading ? "ĐANG XỬ LÝ..." : "PHÂN TÍCH NGAY"}</span>
                        <motion.div 
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"
                        />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {loading && (
                  <div className="mt-8 space-y-4">
                    <div className="flex justify-between items-end">
                      <p className="text-cyan-400 font-black tracking-widest text-xs animate-pulse">AI ENGINE PROCESSING</p>
                      <p className="text-slate-600 font-mono text-[10px]">VERIFYING PATTERNS...</p>
                    </div>
                    <div className="w-full bg-slate-800/50 rounded-full h-2 overflow-hidden border border-white/5">
                      <motion.div 
                        initial={{ x: '-100%' }}
                        animate={{ x: '100%' }}
                        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                        className="bg-gradient-to-r from-transparent via-cyan-500 to-transparent h-full w-1/2 rounded-full shadow-[0_0_15px_rgba(6,182,212,0.6)]"
                      />
                    </div>
                  </div>
                )}
              </motion.div>

              {/* Results Section */}
              <motion.div 
                layout
                className={`bg-slate-900/40 backdrop-blur-2xl p-8 rounded-[2.5rem] shadow-2xl border border-white/5 ${mode === 'Pro' ? 'lg:col-span-7' : ''}`}
              >
                <div className="flex items-center gap-5 mb-10">
                  <div className="p-4 bg-fuchsia-500/10 rounded-2xl border border-fuchsia-500/20 shadow-[0_0_20px_rgba(217,70,239,0.15)]">
                    <Brain className="w-8 h-8 text-fuchsia-400" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-white tracking-tight">Kết quả phân tích</h2>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">AI Intelligence</p>
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {analysis ? (
                    <motion.div 
                      key="result"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-10"
                    >
                      <div className="bg-slate-950/40 p-12 rounded-[2.5rem] border border-white/5 text-center relative overflow-hidden group">
                        <div className={`absolute inset-0 opacity-20 blur-[100px] transition-colors duration-1000 ${analysis.suggestion === 'Tài' ? 'bg-red-500' : 'bg-cyan-500'}`} />
                        
                        <p className="text-slate-500 font-black uppercase tracking-[0.4em] text-[10px] mb-6 relative z-10">AI PREDICTION</p>
                        <div className={`text-8xl md:text-[10rem] font-black mb-8 tracking-tighter relative z-10 drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-colors duration-1000 ${analysis.suggestion === 'Tài' ? 'text-red-500' : 'text-cyan-400'}`}>
                          {analysis.suggestion}
                        </div>

                        {analysis.detectedPattern && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="mb-8 relative z-10"
                          >
                            <button 
                              onClick={() => setActiveTab('patterns')}
                              className="bg-white/[0.03] hover:bg-white/[0.08] p-5 rounded-3xl border border-white/10 transition-all text-left max-w-xs mx-auto group active:scale-95"
                            >
                              <div className="flex items-center gap-3 mb-2">
                                <div className="p-1.5 bg-fuchsia-500/20 rounded-lg">
                                  <Brain size={14} className="text-fuchsia-400" />
                                </div>
                                <span className="text-[10px] font-black text-fuchsia-400 uppercase tracking-widest">Mẫu hình</span>
                              </div>
                              <p className="text-white font-black text-xl mb-1 tracking-tight">{analysis.detectedPattern}</p>
                              <p className="text-slate-500 text-[10px] leading-relaxed group-hover:text-slate-400 transition-colors font-medium">
                                {PATTERNS.find(p => p.name === analysis.detectedPattern)?.desc || "Nhấn để xem chi tiết mẫu hình này."}
                              </p>
                            </button>
                          </motion.div>
                        )}

                        {mode === 'Pro' && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="inline-flex items-center gap-3 bg-white/[0.03] px-6 py-2.5 rounded-full border border-white/10 relative z-10"
                          >
                            <Activity size={14} className="text-cyan-400" />
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Confidence:</span>
                            <span className="text-sm font-black text-white font-mono">{(analysis.confidenceScore * 100).toFixed(0)}%</span>
                          </motion.div>
                        )}
                      </div>

                      {/* Capital Management Suggestion */}
                      {mode === 'Pro' && analysis.betSuggestion && (
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-8 rounded-[2.5rem] border border-cyan-500/20 shadow-2xl relative overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 p-6 opacity-10">
                            <Wallet size={80} className="text-cyan-400" />
                          </div>
                          
                          <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                              <Wallet className="w-6 h-6 text-cyan-400" />
                            </div>
                            <div>
                              <h4 className="text-lg font-black text-white tracking-tight">Quản lý vốn AI</h4>
                              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Money Management</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-1">
                              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Số tiền gợi ý</p>
                              <p className="text-2xl font-black text-white font-mono">
                                {analysis.betSuggestion.amount.toLocaleString('vi-VN')} <span className="text-xs text-slate-500">VND</span>
                              </p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tỷ lệ vốn</p>
                              <p className="text-2xl font-black text-cyan-400 font-mono">
                                {analysis.betSuggestion.percentage}%
                              </p>
                            </div>
                          </div>

                          <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mức độ rủi ro:</span>
                              <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${
                                analysis.betSuggestion.riskLevel === 'Low' ? 'bg-green-500/10 text-green-500' :
                                analysis.betSuggestion.riskLevel === 'Medium' ? 'bg-amber-500/10 text-amber-500' :
                                analysis.betSuggestion.riskLevel === 'High' ? 'bg-orange-500/10 text-orange-500' :
                                'bg-red-500/10 text-red-500'
                              }`}>
                                {analysis.betSuggestion.riskLevel}
                              </span>
                            </div>
                            <p className="text-[9px] text-slate-600 italic">Dựa trên độ tự tin {(analysis.confidenceScore * 100).toFixed(0)}%</p>
                          </div>
                        </motion.div>
                      )}

                      {mode === 'Pro' && (
                        <div className="space-y-6">
                          <div className="flex items-center justify-between px-2">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Technical Indicators</p>
                            <div className="h-px flex-1 bg-white/5 mx-4" />
                          </div>
                          <div className="grid gap-3">
                            {analysis.reasons.map((r, i) => (
                              <motion.div 
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0, transition: { delay: i * 0.1 } }}
                                className="bg-white/[0.02] p-5 rounded-2xl border border-white/5 flex items-center justify-between group hover:bg-white/[0.04] hover:border-white/10 transition-all cursor-default"
                              >
                                <div className="flex items-center gap-5">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${r.contribution === 'Tài' ? 'bg-red-500/10' : r.contribution === 'Xỉu' ? 'bg-cyan-500/10' : 'bg-slate-700/30'}`}>
                                    {r.contribution === 'Tài' && <TrendingUp size={20} className="text-red-500" />}
                                    {r.contribution === 'Xỉu' && <TrendingDown size={20} className="text-cyan-400" />}
                                    {r.contribution === 'Neutral' && <Minus size={20} className="text-slate-500" />}
                                  </div>
                                  <span className="font-bold text-slate-200 tracking-tight">{r.text}</span>
                                </div>
                                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg ${r.contribution === 'Tài' ? 'text-red-500 bg-red-500/5' : r.contribution === 'Xỉu' ? 'text-cyan-400 bg-cyan-400/5' : 'text-slate-500 bg-slate-500/5'}`}>
                                  {r.contribution}
                                </span>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {mode === 'Pro' && (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="p-6 bg-amber-500/[0.03] border border-amber-500/10 rounded-3xl flex gap-5 items-start"
                        >
                          <div className="p-2 bg-amber-500/10 rounded-xl">
                            <ShieldAlert className="w-5 h-5 text-amber-500" />
                          </div>
                          <div className="space-y-1">
                            <h5 className="text-amber-500 font-black text-[10px] uppercase tracking-widest">Risk Advisory</h5>
                            <p className="text-xs text-slate-500 leading-relaxed font-medium">
                              Hệ thống AI chỉ mang tính chất tham khảo. Kết quả không đảm bảo chính xác 100%. 
                              Hãy quản lý vốn thông minh và chịu trách nhiệm với quyết định của mình.
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  ) : loading ? (
                    <motion.div 
                      key="loading"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.05 }}
                      className="bg-slate-950/40 p-12 rounded-[2.5rem] border border-white/5 text-center relative overflow-hidden min-h-[500px] flex flex-col items-center justify-center"
                    >
                      {/* Sophisticated Background Glows */}
                      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-fuchsia-500/5" />
                      <motion.div 
                        animate={{ 
                          scale: [1, 1.2, 1],
                          opacity: [0.1, 0.2, 0.1]
                        }}
                        transition={{ duration: 4, repeat: Infinity }}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-cyan-500/20 rounded-full blur-[120px]"
                      />

                      {/* Holographic Grid */}
                      <div className="absolute inset-0 bg-[grid-white_0.05] [mask-image:radial-gradient(white,transparent_70%)] opacity-20" />

                      {/* Scanning Beam */}
                      <motion.div 
                        animate={{ top: ['-10%', '110%'] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_20px_rgba(34,211,238,0.8)] z-20"
                      />

                      <div className="relative z-10 space-y-10">
                        <div className="relative inline-block">
                          {/* Pulsing Outer Rings */}
                          <motion.div 
                            animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="absolute inset-0 border-2 border-cyan-500/50 rounded-full"
                          />
                          <motion.div 
                            animate={{ scale: [1, 2], opacity: [0.3, 0] }}
                            transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
                            className="absolute inset-0 border border-cyan-500/20 rounded-full"
                          />
                          
                          <div className="w-28 h-28 bg-slate-900 rounded-full flex items-center justify-center border border-white/10 shadow-[0_0_50px_rgba(6,182,212,0.3)] relative z-10 overflow-hidden">
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                              className="absolute inset-0 border-t-2 border-cyan-500/50 rounded-full"
                            />
                            <Brain size={48} className="text-cyan-400 animate-pulse" />
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div className="space-y-2">
                            <motion.p 
                              animate={{ opacity: [0.4, 1, 0.4] }}
                              transition={{ duration: 2, repeat: Infinity }}
                              className="text-cyan-400 font-black uppercase tracking-[0.3em] text-xs"
                            >
                              {loadingStep || "AI Prediction Active"}
                            </motion.p>
                            <div className="h-1.5 w-56 bg-slate-800 mx-auto rounded-full overflow-hidden border border-white/5 shadow-inner">
                              <motion.div 
                                animate={{ x: ['-100%', '100%'] }}
                                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                className="w-1/2 h-full bg-gradient-to-r from-transparent via-cyan-500 to-transparent"
                              />
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-center gap-1">
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">
                              Neural Network Processing
                            </p>
                            <div className="flex gap-1.5">
                              {[0, 1, 2].map(i => (
                                <motion.div 
                                  key={i}
                                  animate={{ 
                                    scale: [1, 1.5, 1],
                                    backgroundColor: ['#64748b', '#06b6d4', '#64748b']
                                  }}
                                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                                  className="w-1.5 h-1.5 rounded-full"
                                />
                              ))}
                            </div>
                            <button 
                              onClick={() => {
                                setLoading(false);
                                setLoadingStep("");
                                showToast("Đã hủy phân tích.");
                              }}
                              className="mt-6 px-6 py-2.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-slate-500 hover:text-red-500 text-[10px] font-black uppercase tracking-widest transition-all border border-white/5 hover:border-red-500/30 active:scale-95"
                            >
                              Hủy phân tích
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Floating Data Particles */}
                      <div className="absolute inset-0 pointer-events-none">
                        {[...Array(20)].map((_, i) => (
                          <motion.div
                            key={i}
                            initial={{ 
                              x: Math.random() * 600 - 300, 
                              y: Math.random() * 600 - 300,
                              opacity: 0 
                            }}
                            animate={{ 
                              y: [null, Math.random() * -200],
                              opacity: [0, 0.8, 0],
                              scale: [0.5, 1.2, 0.5]
                            }}
                            transition={{ 
                              duration: 3 + Math.random() * 3, 
                              repeat: Infinity,
                              delay: Math.random() * 5
                            }}
                            className="absolute w-1 h-1 bg-cyan-400/40 rounded-full blur-[1px]"
                          />
                        ))}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center justify-center py-24 text-center space-y-6"
                    >
                      <div className="relative">
                        <div className="absolute inset-0 bg-cyan-500/20 blur-3xl rounded-full" />
                        <Activity size={64} className="text-slate-800 relative z-10" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Hệ thống đang chờ</p>
                        <p className="text-slate-600 text-sm max-w-xs">Tải ảnh lịch sử cầu để AI bắt đầu quá trình nhận diện mẫu hình</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-red-950/20 border border-red-900/30 p-8 rounded-[2.5rem] text-center space-y-6"
                  >
                    <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
                      <AlertTriangle className="text-red-500" size={40} />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-red-500 font-black uppercase tracking-widest text-xs">Phân tích thất bại</h4>
                      <p className="text-red-200/80 font-bold leading-relaxed max-w-sm mx-auto">{error}</p>
                    </div>

                    <div className="bg-black/20 p-6 rounded-2xl border border-white/5 text-left space-y-3">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mẹo khắc phục:</p>
                      <ul className="text-[11px] text-slate-400 space-y-2 font-medium">
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 rounded-full bg-cyan-500" />
                          Chụp ảnh màn hình trực tiếp, tránh chụp qua gương/kính.
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 rounded-full bg-cyan-500" />
                          Đảm bảo bảng lịch sử cầu nằm ở trung tâm khung hình.
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1 h-1 rounded-full bg-cyan-500" />
                          Lau sạch ống kính camera nếu chụp từ thiết bị khác.
                        </li>
                      </ul>
                    </div>

                    <button 
                      onClick={() => setError(null)} 
                      className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white text-xs font-black uppercase tracking-widest transition-all active:scale-95"
                    >
                      Thử lại ngay
                    </button>
                  </motion.div>
                )}
              </motion.div>
            </>
          )}
        </motion.div>
      </main>

      <footer className="mt-32 py-12 text-center border-t border-slate-900 relative z-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center font-black text-slate-950 text-xs">TX</div>
            <p className="text-slate-400 font-bold tracking-tight">Tài Xỉu Pattern Analyzer</p>
          </div>
          
          <div className="flex items-center gap-6">
            <p className="text-slate-600 text-xs font-mono">BUILD v1.0.0-STABLE</p>
            <div className="h-4 w-px bg-slate-800" />
            <a href="#" className="text-slate-500 hover:text-cyan-400 text-xs font-bold transition-colors uppercase tracking-widest">Changelog</a>
            <a href="#" className="text-slate-500 hover:text-cyan-400 text-xs font-bold transition-colors uppercase tracking-widest">Support</a>
          </div>
        </div>
        <p className="text-slate-700 text-[10px] mt-8 uppercase tracking-[0.5em]">© 2026 NEURAL PATTERN SYSTEMS</p>
      </footer>
    </div>
  );
}
