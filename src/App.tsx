/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Upload, Brain, AlertTriangle, HelpCircle, X } from 'lucide-react';
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
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
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
    setAnalysis(null);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const resizedImage = await resizeImage(image, 1024, 1024);
      const base64Data = resizedImage.split(',')[1];
      
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: {
          parts: [
            { text: `Phân tích nhanh hình ảnh lịch sử cầu Tài Xỉu này, ưu tiên mẫu hình '${settings.preferredPatterns}'. Đưa ra gợi ý 'Tài' hoặc 'Xỉu', 3 từ khóa lý do (kèm đánh giá đóng góp 'Tài', 'Xỉu', 'Neutral') và điểm tự tin (0-1). Trả lời ngắn gọn bằng tiếng Việt.` },
            { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
          ]
        },
        config: {
          responseMimeType: "application/json",
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
      const result = JSON.parse(response.text || "{}") as AnalysisResult;
      setAnalysis(result);
      playSound('success');
      showToast("Phân tích thành công!");
    } catch (error: any) {
      console.error(error);
      setError("Lỗi phân tích hình ảnh.");
      playSound('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      {toast && (
        <div className="fixed top-4 right-4 bg-cyan-600 text-white px-6 py-3 rounded-lg shadow-lg shadow-cyan-900/20 z-50 animate-fade-in-down">
          {toast}
        </div>
      )}
      {showGuide && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold">Hướng dẫn sử dụng</h2>
              <button onClick={() => setShowGuide(false)} className="text-gray-400 hover:text-white"><X /></button>
            </div>
            <div className="space-y-6 text-gray-300">
              <p>Chào mừng bạn đến với <strong>Tài Xỉu Pattern Analyzer</strong>!</p>
              <h3 className="text-xl font-semibold text-cyan-400">1. Tải ảnh lịch sử cầu</h3>
              <p>Nhấn vào nút "Tải ảnh" và chọn ảnh chụp lịch sử cầu Tài Xỉu từ thiết bị của bạn. Hệ thống sẽ tự động xử lý và phân tích.</p>
              <h3 className="text-xl font-semibold text-cyan-400">2. Chế độ phân tích</h3>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Focus Mode:</strong> Tập trung tối đa vào kết quả gợi ý, lược bỏ các thông tin chi tiết để bạn dễ dàng đưa ra quyết định nhanh.</li>
                <li><strong>Pro Mode:</strong> Hiển thị đầy đủ kết quả, điểm tự tin, các lý do phân tích chi tiết và cảnh báo rủi ro.</li>
              </ul>
              <h3 className="text-xl font-semibold text-cyan-400">3. Đọc kết quả & Ký hiệu</h3>
              <p>Kết quả gợi ý sẽ hiển thị "Tài" hoặc "Xỉu" với màu sắc tương ứng. Trong Pro Mode, bạn sẽ thấy các từ khóa lý do kèm chỉ báo:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><span className="inline-block w-3 h-3 rounded-full bg-red-500"></span> <strong>Đỏ:</strong> Yếu tố ủng hộ "Tài".</li>
                <li><span className="inline-block w-3 h-3 rounded-full bg-cyan-400"></span> <strong>Xanh:</strong> Yếu tố ủng hộ "Xỉu".</li>
                <li><span className="inline-block w-3 h-3 rounded-full bg-gray-500"></span> <strong>Xám:</strong> Yếu tố trung lập.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
      <header className="mb-12 text-center flex flex-col items-center relative">
        <button onClick={() => setShowGuide(true)} className="absolute right-0 top-0 text-slate-400 hover:text-cyan-400 transition">
          <HelpCircle size={28} />
        </button>
        <h1 className="text-5xl font-extrabold text-white tracking-tighter">Tài Xỉu Pattern Analyzer</h1>
        <p className="text-slate-400 mt-3 mb-6 font-medium">Công cụ phân tích cầu Tài Xỉu chuyên nghiệp</p>
        
        <div className="bg-slate-900 p-1 rounded-lg flex gap-1 border border-slate-800 mb-6">
          <button 
            onClick={() => setActiveTab('analyze')}
            className={`px-6 py-2 rounded-md text-sm font-semibold transition ${activeTab === 'analyze' ? 'bg-slate-800 text-cyan-400 shadow-sm' : 'text-slate-400 hover:text-slate-100'}`}
          >
            Phân tích
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`px-6 py-2 rounded-md text-sm font-semibold transition ${activeTab === 'settings' ? 'bg-slate-800 text-cyan-400 shadow-sm' : 'text-slate-400 hover:text-slate-100'}`}
          >
            Cài đặt
          </button>
        </div>

        <div className="bg-slate-900 p-1 rounded-lg flex gap-1 border border-slate-800">
          <button 
            onClick={() => setMode('Focus')}
            className={`px-6 py-2 rounded-md text-sm font-semibold transition ${mode === 'Focus' ? 'bg-slate-800 text-cyan-400 shadow-sm' : 'text-slate-400 hover:text-slate-100'}`}
          >
            Focus Mode
          </button>
          <button 
            onClick={() => setMode('Pro')}
            className={`px-6 py-2 rounded-md text-sm font-semibold transition ${mode === 'Pro' ? 'bg-slate-800 text-cyan-400 shadow-sm' : 'text-slate-400 hover:text-slate-100'}`}
          >
            Pro Mode
          </button>
        </div>
      </header>

      <div className={`max-w-5xl mx-auto ${activeTab === 'analyze' ? `grid gap-8 ${mode === 'Focus' ? 'md:grid-cols-1 max-w-2xl' : 'md:grid-cols-2'}` : ''}`}>
        {activeTab === 'settings' && (
          <div className="bg-slate-900 p-8 rounded-xl shadow-lg border border-slate-800 max-w-2xl mx-auto w-full">
            <h2 className="text-2xl font-bold text-white mb-6">Cài đặt</h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Cường độ âm thanh</label>
                <input 
                  type="range" min="0" max="1" step="0.1" value={settings.volume} 
                  onChange={(e) => setSettings({...settings, volume: parseFloat(e.target.value)})}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-400">Bật thông báo Toast</label>
                <input 
                  type="checkbox" checked={settings.toastEnabled}
                  onChange={(e) => setSettings({...settings, toastEnabled: e.target.checked})}
                  className="w-5 h-5 rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Mẫu hình ưu tiên</label>
                <select 
                  value={settings.preferredPatterns}
                  onChange={(e) => setSettings({...settings, preferredPatterns: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-slate-100"
                >
                  <option>Cầu bệt</option>
                  <option>Cầu 1-1</option>
                  <option>Cầu 2-2</option>
                  <option>Cầu đảo</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analyze' && (
          <>
            {/* Upload Section */}
        <div className="bg-slate-900 p-8 rounded-xl shadow-lg border border-slate-800">
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-cyan-950 rounded-lg border border-cyan-900">
              <Upload className="w-7 h-7 text-cyan-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Tải ảnh lịch sử cầu</h2>
          </div>
          <input type="file" accept="image/*" onChange={handleImageUpload} className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-cyan-600 file:text-white hover:file:bg-cyan-700 mb-8 transition" />
          {image && <img src={image} alt="Uploaded" className="max-w-full h-auto rounded-lg border border-slate-700 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-cyan-900/50 cursor-pointer" />}
          {image && (
            <button 
              onClick={analyzeImage} 
              disabled={loading}
              className="mt-8 w-full bg-cyan-600 text-white py-3 px-6 rounded-lg font-semibold text-lg hover:bg-cyan-700 transition disabled:bg-slate-800 disabled:text-slate-500 shadow-sm"
            >
              {loading ? "Đang phân tích..." : "Phân tích cầu"}
            </button>
          )}
          {loading && (
            <div className="mt-6">
              <p className="text-cyan-400 text-center font-bold animate-pulse mb-3">Đang phân tích cầu...</p>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div className="bg-cyan-600 h-2 rounded-full animate-loading bg-[length:200%_100%]"></div>
              </div>
            </div>
          )}
        </div>

        {/* Results Section */}
        {analysis && (
          <div className="bg-slate-900 p-8 rounded-xl shadow-lg border border-slate-800">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-cyan-950 rounded-lg border border-cyan-900">
                <Brain className="w-7 h-7 text-cyan-400" />
              </div>
              <h2 className="text-2xl font-bold text-white">Kết quả gợi ý</h2>
            </div>
            <div className="bg-slate-950 p-8 rounded-lg border border-slate-800 text-center">
              <div className={`text-7xl font-black mb-6 tracking-tighter ${analysis.suggestion === 'Tài' ? 'text-red-500' : 'text-cyan-400'}`}>
                {analysis.suggestion}
                {mode === 'Pro' && (
                  <span className="text-3xl text-slate-400 ml-4 font-mono">
                    ({(analysis.confidenceScore * 100).toFixed(0)}%)
                  </span>
                )}
              </div>
              {mode === 'Pro' && (
                <div className="flex flex-wrap justify-center gap-3 mt-6">
                  {analysis.reasons.map((r, i) => (
                    <span key={i} className="bg-slate-900 px-4 py-2 rounded-full text-sm font-semibold text-slate-100 flex items-center gap-3 border border-slate-800 shadow-sm">
                      <span className={`w-3 h-3 rounded-full ${r.contribution === 'Tài' ? 'bg-red-500' : r.contribution === 'Xỉu' ? 'bg-blue-500' : 'bg-slate-500'}`}></span>
                      {r.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
            
            {mode === 'Pro' && (
              <div className="mt-8 p-5 bg-amber-950/30 border border-amber-900/50 rounded-lg flex gap-4">
                <AlertTriangle className="w-12 h-12 text-amber-500 flex-shrink-0" />
                <p className="text-sm text-amber-200 leading-relaxed">
                  <strong>Cảnh báo:</strong> Công cụ này chỉ mang tính chất tham khảo và giải trí. 
                  Kết quả không đảm bảo chính xác. Cờ bạc luôn tiềm ẩn rủi ro, hãy cân nhắc kỹ.
                </p>
              </div>
            )}
          </div>
        )}
        
        {!analysis && !loading && !error && (
          <div className="bg-slate-900 p-8 rounded-xl shadow-lg border border-slate-800 flex items-center justify-center">
            <div className="text-center py-16 border-2 border-dashed border-slate-800 rounded-lg text-slate-500 font-medium">
              Chưa có dữ liệu phân tích
            </div>
          </div>
        )}
        
        {error && (
          <div className="bg-slate-900 p-8 rounded-lg shadow-lg border border-slate-800 flex items-center justify-center">
            <div className="text-red-400 text-center py-16 font-semibold">{error}</div>
          </div>
        )}
          </>
        )}
      </div>
      <footer className="mt-20 py-6 text-center border-t border-slate-800">
        <p className="text-slate-500 text-sm">
          v1.0.0 | <a href="#" className="hover:text-cyan-400 transition">Release Notes</a>
        </p>
      </footer>
    </div>
  );
}
