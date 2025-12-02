import React from 'react';
import { Message } from '../types';
import { BotIcon, UserIcon } from './Icons';

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isModel = message.role === 'model';

  return (
    <div className={`flex w-full ${isModel ? 'justify-start' : 'justify-end'} animate-fade-in-up`}>
      <div 
        className={`flex max-w-[85%] md:max-w-[75%] gap-3 p-4 rounded-2xl shadow-lg border backdrop-blur-sm
        ${isModel 
          ? 'bg-black/60 border-neutral-800 text-gray-200 rounded-tl-none' 
          : 'bg-gradient-to-br from-red-950/80 to-red-900/60 border-red-900/50 text-white rounded-tr-none'
        }`}
      >
        <div className={`flex-shrink-0 mt-1 ${isModel ? 'text-red-500' : 'text-red-200'}`}>
          {isModel ? <BotIcon className="w-6 h-6" /> : <UserIcon className="w-6 h-6" />}
        </div>
        
        <div className="flex-1 overflow-hidden">
          <div className="prose prose-invert prose-p:leading-relaxed prose-pre:bg-neutral-900 prose-pre:border prose-pre:border-neutral-800 max-w-none">
            <p 
              className="whitespace-pre-wrap text-sm md:text-base leading-relaxed" 
              dir="auto" // Automatically handles RTL for Arabic
            >
              {message.content}
              {message.isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 align-middle bg-red-500 animate-pulse" />
              )}
            </p>
          </div>
          <div className={`text-[10px] mt-2 opacity-50 ${isModel ? 'text-left' : 'text-right'}`}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    </div>
  );
};
