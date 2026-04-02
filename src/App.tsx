/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { Upload, Brain, AlertTriangle, HelpCircle, X, TrendingUp, TrendingDown, Minus, Settings, Activity, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { resizeImage } from './lib/imageUtils';

interface Reason {
  text: string;
  contribution: 'Tài' | 'Xỉu' | 'Neutral';
}

interface AnalysisResult {
  suggestion: 'Tài' | 'Xỉu';
  reasons: Reason[];
  confidenceScore: number;
}

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'Focus' | 'Pro'>('Pro');
  const [activeTab, setActiveTab] = useState<'analyze' | 'settings'>('analyze');
  const [toast, setToast] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [settings, setSettings] = useState({
    volume: 0.5,
    toastEnabled: true,
    preferredPatterns: 'Cầu bệt'
  });

  const showToast = (message: string) => {
    if (!settings.toastEnabled) return;
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Revoke old blob URL to free memory
      if (image && image.startsWith('blob:')) {
        URL.revokeObjectURL(image);
      }
      
      const url = URL.createObjectURL(file);
      setImage(url);
      setAnalysis(null);
      setError(null);
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
    setAnalysis(null);
    setError(null);

    try {
      const apiKey = process.env.GEMINI_API_KEY || (import.meta.env.VITE_GEMINI_API_KEY as string);
      if (!apiKey) {
        throw new Error("Thiếu API Key. Vui lòng kiểm tra cài đặt.");
      }

      const ai = new GoogleGenAI({ apiKey });
      
      // Use a smaller dimension for faster processing on mobile
      const resizedImage = await resizeImage(image, 768, 768);
      const base64Data = resizedImage.split(',')[1];
      
      if (!base64Data) {
        throw new Error("Dữ liệu ảnh không hợp lệ.");
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: {
          parts: [
            { text: `Phân tích hình ảnh lịch sử cầu Tài Xỉu này. Ưu tiên mẫu hình '${settings.preferredPatterns}'. 
            Đưa ra gợi ý 'Tài' hoặc 'Xỉu', 3 lý do chính xác dựa trên hình ảnh, và điểm tự tin (0-1). 
            Trả lời bằng tiếng Việt, định dạng JSON.` },
            { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
          ]
        },
        config: {
          systemInstruction: "Bạn là một hệ thống phân tích mẫu hình toán học chuyên biệt cho trò chơi Tài Xỉu. Nhiệm vụ của bạn là nhận diện các chuỗi (cầu) từ hình ảnh lịch sử và đưa ra dự đoán xác suất dựa trên các mẫu hình phổ biến (cầu bệt, cầu 1-1, cầu đảo, v.v.). Luôn trả về kết quả dưới dạng JSON hợp lệ.",
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestion: { type: Type.STRING, description: "Tài hoặc Xỉu" },
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
      
      if (!response.text) {
        throw new Error("AI không thể đọc được dữ liệu từ ảnh này. Vui lòng chụp rõ hơn.");
      }

      let result: AnalysisResult;
      try {
        result = JSON.parse(response.text) as AnalysisResult;
      } catch (parseErr) {
        console.error("JSON Parse Error:", parseErr, response.text);
        throw new Error("Dữ liệu từ AI không hợp lệ. Vui lòng thử lại.");
      }
      
      setAnalysis(result);
      playSound('success');
      showToast("Phân tích thành công!");
    } catch (err: any) {
      console.error("Analysis Error Details:", err);
      let msg = "Lỗi phân tích hình ảnh. Vui lòng thử lại.";
      
      if (err.message?.includes("API Key")) msg = err.message;
      else if (err.message?.includes("Failed to load image")) msg = "Không thể tải ảnh. Vui lòng chọn ảnh khác.";
      else if (err.message?.includes("quota")) msg = "Hệ thống đang quá tải (hết quota). Vui lòng đợi 1 phút.";
      else if (err.message?.includes("safety")) msg = "Ảnh bị từ chối vì lý do an toàn. Vui lòng chụp rõ cầu hơn.";
      else if (err.message) msg = err.message;
      
      setError(msg);
      playSound('error');
      showToast("Lỗi phân tích!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-4 md:p-8 font-sans selection:bg-cyan-500/30">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-fuchsia-500/10 blur-[120px] rounded-full" />
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
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500/10 rounded-lg">
                    <HelpCircle className="text-cyan-400" />
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight">Hướng dẫn sử dụng</h2>
                </div>
                <button onClick={() => setShowGuide(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"><X /></button>
              </div>
              <div className="space-y-8 text-slate-300">
                <section>
                  <h3 className="text-xl font-semibold text-cyan-400 mb-3 flex items-center gap-2">
                    <Upload size={20} /> 1. Tải ảnh lịch sử cầu
                  </h3>
                  <p className="leading-relaxed">Nhấn vào nút "Tải ảnh" và chọn ảnh chụp lịch sử cầu Tài Xỉu từ thiết bị của bạn. Hệ thống sẽ tự động xử lý và phân tích bằng AI thế hệ mới.</p>
                </section>
                <section>
                  <h3 className="text-xl font-semibold text-cyan-400 mb-3 flex items-center gap-2">
                    <Activity size={20} /> 2. Chế độ phân tích
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                      <h4 className="font-bold text-white mb-1">Focus Mode</h4>
                      <p className="text-sm">Tối giản, chỉ hiển thị kết quả chính để quyết định nhanh.</p>
                    </div>
                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                      <h4 className="font-bold text-white mb-1">Pro Mode</h4>
                      <p className="text-sm">Chi tiết, hiển thị độ tin cậy và các lý do kỹ thuật.</p>
                    </div>
                  </div>
                </section>
                <section>
                  <h3 className="text-xl font-semibold text-cyan-400 mb-3 flex items-center gap-2">
                    <Brain size={20} /> 3. Đọc kết quả & Ký hiệu
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 bg-slate-800/30 p-3 rounded-lg">
                      <TrendingUp className="text-red-500" />
                      <span>Ủng hộ <strong>Tài</strong></span>
                    </div>
                    <div className="flex items-center gap-3 bg-slate-800/30 p-3 rounded-lg">
                      <TrendingDown className="text-cyan-400" />
                      <span>Ủng hộ <strong>Xỉu</strong></span>
                    </div>
                    <div className="flex items-center gap-3 bg-slate-800/30 p-3 rounded-lg">
                      <Minus className="text-slate-500" />
                      <span>Yếu tố trung lập</span>
                    </div>
                  </div>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="mb-16 text-center flex flex-col items-center relative z-10">
        <motion.button 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowGuide(true)} 
          className="absolute right-0 top-0 p-2 text-slate-500 hover:text-cyan-400 transition-colors"
        >
          <HelpCircle size={28} />
        </motion.button>
        
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mb-8"
        >
          <h1 className="text-6xl font-black text-white tracking-tighter mb-2 bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
            PATTERN ANALYZER
          </h1>
          <div className="h-1 w-24 bg-cyan-500 mx-auto rounded-full shadow-[0_0_15px_rgba(6,182,212,0.5)]" />
        </motion.div>

        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="bg-slate-900/50 backdrop-blur-md p-1 rounded-2xl flex gap-1 border border-slate-800 shadow-xl">
            <button 
              onClick={() => setActiveTab('analyze')}
              className={`relative px-8 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'analyze' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {activeTab === 'analyze' && (
                <motion.div layoutId="tab-bg" className="absolute inset-0 bg-slate-800 rounded-xl -z-10" />
              )}
              <div className="flex items-center gap-2">
                <Activity size={16} /> Phân tích
              </div>
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`relative px-8 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'settings' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {activeTab === 'settings' && (
                <motion.div layoutId="tab-bg" className="absolute inset-0 bg-slate-800 rounded-xl -z-10" />
              )}
              <div className="flex items-center gap-2">
                <Settings size={16} /> Cài đặt
              </div>
            </button>
          </div>

          <div className="bg-slate-900/50 backdrop-blur-md p-1 rounded-2xl flex gap-1 border border-slate-800 shadow-xl">
            <button 
              onClick={() => setMode('Focus')}
              className={`relative px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${mode === 'Focus' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {mode === 'Focus' && (
                <motion.div layoutId="mode-bg" className="absolute inset-0 bg-cyan-500/10 rounded-xl -z-10 border border-cyan-500/20" />
              )}
              Focus
            </button>
            <button 
              onClick={() => setMode('Pro')}
              className={`relative px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${mode === 'Pro' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {mode === 'Pro' && (
                <motion.div layoutId="mode-bg" className="absolute inset-0 bg-cyan-500/10 rounded-xl -z-10 border border-cyan-500/20" />
              )}
              Pro
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <motion.div 
          layout
          className={`max-w-6xl mx-auto ${activeTab === 'analyze' ? `grid gap-8 ${mode === 'Focus' ? 'md:grid-cols-1 max-w-2xl' : 'lg:grid-cols-12'}` : ''}`}
        >
          {activeTab === 'settings' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-slate-900/80 backdrop-blur-xl p-10 rounded-3xl shadow-2xl border border-slate-800 max-w-2xl mx-auto w-full"
            >
              <div className="flex items-center gap-4 mb-10">
                <div className="p-3 bg-cyan-500/10 rounded-2xl border border-cyan-500/20">
                  <Settings className="text-cyan-400" />
                </div>
                <h2 className="text-3xl font-bold text-white tracking-tight">Cấu hình hệ thống</h2>
              </div>
              
              <div className="space-y-10">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-slate-400 uppercase tracking-widest">Âm lượng</label>
                    <span className="text-cyan-400 font-mono">{(settings.volume * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.1" value={settings.volume} 
                    onChange={(e) => setSettings({...settings, volume: parseFloat(e.target.value)})}
                    className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-cyan-500"
                  />
                </div>
                
                <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-2xl border border-slate-800">
                  <div className="space-y-1">
                    <label className="text-sm font-bold text-white">Thông báo hệ thống</label>
                    <p className="text-xs text-slate-500">Hiển thị các thông báo trạng thái nhanh</p>
                  </div>
                  <button 
                    onClick={() => setSettings({...settings, toastEnabled: !settings.toastEnabled})}
                    className={`w-12 h-6 rounded-full transition-colors relative ${settings.toastEnabled ? 'bg-cyan-600' : 'bg-slate-700'}`}
                  >
                    <motion.div 
                      animate={{ x: settings.toastEnabled ? 26 : 4 }}
                      className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                    />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-widest">Mẫu hình ưu tiên</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['Cầu bệt', 'Cầu 1-1', 'Cầu 2-2', 'Cầu đảo'].map((p) => (
                      <button
                        key={p}
                        onClick={() => setSettings({...settings, preferredPatterns: p})}
                        className={`px-4 py-3 rounded-xl text-sm font-semibold border transition-all ${settings.preferredPatterns === p ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'}`}
                      >
                        {p}
                      </button>
                    ))}
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
                className={`bg-slate-900/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-slate-800 ${mode === 'Pro' ? 'lg:col-span-5' : ''}`}
              >
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-3 bg-cyan-500/10 rounded-2xl border border-cyan-500/20">
                    <Upload className="w-7 h-7 text-cyan-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">Dữ liệu đầu vào</h2>
                </div>
                
                <div className="relative group mb-8">
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleImageUpload} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="border-2 border-dashed border-slate-800 group-hover:border-cyan-500/50 rounded-2xl p-8 transition-all bg-slate-950/30 text-center">
                    <Upload className="mx-auto mb-4 text-slate-600 group-hover:text-cyan-400 transition-colors" size={32} />
                    <p className="text-slate-400 font-medium">Kéo thả hoặc nhấp để tải ảnh</p>
                    <p className="text-slate-600 text-xs mt-1">Hỗ trợ JPG, PNG, WEBP (Max 5MB)</p>
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {image && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="space-y-6"
                    >
                      <div className="relative group overflow-hidden rounded-2xl border border-slate-800 shadow-2xl">
                        <img 
                          src={image} 
                          alt="Uploaded" 
                          className="w-full h-auto transition-transform duration-700 group-hover:scale-110" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                          <p className="text-white text-xs font-bold uppercase tracking-widest">Xem trước dữ liệu</p>
                        </div>
                      </div>
                      
                      <button 
                        onClick={analyzeImage} 
                        disabled={loading}
                        className="relative w-full overflow-hidden group bg-cyan-600 text-white py-4 px-8 rounded-2xl font-black text-xl hover:bg-cyan-500 transition-all disabled:bg-slate-800 disabled:text-slate-600 shadow-[0_0_20px_rgba(8,145,178,0.3)]"
                      >
                        <span className="relative z-10">{loading ? "ĐANG XỬ LÝ..." : "PHÂN TÍCH NGAY"}</span>
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
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <motion.div 
                        initial={{ x: '-100%' }}
                        animate={{ x: '100%' }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                        className="bg-cyan-500 h-full w-1/2 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.8)]"
                      />
                    </div>
                  </div>
                )}
              </motion.div>

              {/* Results Section */}
              <motion.div 
                layout
                className={`bg-slate-900/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-slate-800 ${mode === 'Pro' ? 'lg:col-span-7' : ''}`}
              >
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-3 bg-fuchsia-500/10 rounded-2xl border border-fuchsia-500/20">
                    <Brain className="w-7 h-7 text-fuchsia-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">Kết quả phân tích</h2>
                </div>

                <AnimatePresence mode="wait">
                  {analysis ? (
                    <motion.div 
                      key="result"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-8"
                    >
                      <div className="bg-slate-950/50 p-10 rounded-3xl border border-slate-800 text-center relative overflow-hidden group">
                        <div className={`absolute inset-0 opacity-10 blur-3xl transition-colors duration-500 ${analysis.suggestion === 'Tài' ? 'bg-red-500' : 'bg-cyan-500'}`} />
                        
                        <p className="text-slate-500 font-bold uppercase tracking-[0.3em] text-[10px] mb-4 relative z-10">GỢI Ý TỪ HỆ THỐNG</p>
                        <div className={`text-9xl font-black mb-6 tracking-tighter relative z-10 drop-shadow-2xl transition-colors duration-500 ${analysis.suggestion === 'Tài' ? 'text-red-500' : 'text-cyan-400'}`}>
                          {analysis.suggestion}
                        </div>

                        {mode === 'Pro' && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="inline-flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-full border border-slate-800 relative z-10"
                          >
                            <Activity size={14} className="text-cyan-400" />
                            <span className="text-sm font-mono text-slate-400">Độ tin cậy:</span>
                            <span className="text-sm font-black text-white">{(analysis.confidenceScore * 100).toFixed(0)}%</span>
                          </motion.div>
                        )}
                      </div>

                      {mode === 'Pro' && (
                        <div className="grid gap-4">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Cơ sở phân tích</p>
                          {analysis.reasons.map((r, i) => (
                            <motion.div 
                              key={i}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0, transition: { delay: i * 0.1 } }}
                              className="bg-slate-800/40 p-4 rounded-2xl border border-slate-800 flex items-center justify-between group hover:border-slate-700 transition-colors"
                            >
                              <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-lg ${r.contribution === 'Tài' ? 'bg-red-500/10' : r.contribution === 'Xỉu' ? 'bg-cyan-500/10' : 'bg-slate-700/30'}`}>
                                  {r.contribution === 'Tài' && <TrendingUp size={18} className="text-red-500" />}
                                  {r.contribution === 'Xỉu' && <TrendingDown size={18} className="text-cyan-400" />}
                                  {r.contribution === 'Neutral' && <Minus size={18} className="text-slate-500" />}
                                </div>
                                <span className="font-bold text-slate-200">{r.text}</span>
                              </div>
                              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${r.contribution === 'Tài' ? 'text-red-500 bg-red-500/5' : r.contribution === 'Xỉu' ? 'text-cyan-400 bg-cyan-400/5' : 'text-slate-500 bg-slate-500/5'}`}>
                                {r.contribution}
                              </span>
                            </motion.div>
                          ))}
                        </div>
                      )}
                      
                      {mode === 'Pro' && (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="p-5 bg-amber-950/20 border border-amber-900/30 rounded-2xl flex gap-4 items-start"
                        >
                          <ShieldAlert className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <h5 className="text-amber-500 font-bold text-sm">CẢNH BÁO RỦI RO</h5>
                            <p className="text-xs text-amber-200/60 leading-relaxed">
                              Hệ thống AI chỉ mang tính chất tham khảo. Kết quả không đảm bảo chính xác 100%. 
                              Hãy quản lý vốn thông minh và chịu trách nhiệm với quyết định của mình.
                            </p>
                          </div>
                        </motion.div>
                      )}
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
                    className="bg-red-950/20 border border-red-900/30 p-8 rounded-3xl text-center"
                  >
                    <AlertTriangle className="mx-auto mb-4 text-red-500" size={40} />
                    <p className="text-red-400 font-bold">{error}</p>
                    <button onClick={() => setError(null)} className="mt-4 text-xs text-slate-500 hover:text-white transition-colors underline">Thử lại</button>
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
