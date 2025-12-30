
import React, { useState } from 'react';
import { ApiConfig } from '../types';
import { X, Save, Server, Key, Box } from 'lucide-react';

interface SettingsModalProps {
  config: ApiConfig;
  onSave: (config: ApiConfig) => void;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ config, onSave, onClose }) => {
  const [formData, setFormData] = useState<ApiConfig>(config);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Server className="w-5 h-5 text-indigo-600" />
            LLM API Configuration
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-center gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-lg">
            <input
              type="checkbox"
              id="useCustom"
              name="useCustom"
              checked={formData.useCustom}
              onChange={handleChange}
              className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
            />
            <label htmlFor="useCustom" className="text-sm font-medium text-indigo-900 cursor-pointer">
              Use Custom OpenAI-Compatible API
            </label>
          </div>

          <div className={`space-y-4 ${formData.useCustom ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Base URL</label>
              <input
                type="text"
                name="baseUrl"
                value={formData.baseUrl}
                onChange={handleChange}
                placeholder="https://api.openai.com/v1"
                className="w-full p-2 border border-slate-300 rounded-lg text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">API Key</label>
              <input
                type="password"
                name="apiKey"
                value={formData.apiKey}
                onChange={handleChange}
                placeholder="sk-..."
                className="w-full p-2 border border-slate-300 rounded-lg text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Model Name</label>
              <input
                type="text"
                name="modelName"
                value={formData.modelName}
                onChange={handleChange}
                placeholder="gpt-4o, deepseek-chat"
                className="w-full p-2 border border-slate-300 rounded-lg text-sm font-mono"
              />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg text-sm">Cancel</button>
          <button onClick={() => { onSave(formData); onClose(); }} className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 flex items-center gap-2 text-sm">
            <Save className="w-4 h-4" /> Save Config
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
