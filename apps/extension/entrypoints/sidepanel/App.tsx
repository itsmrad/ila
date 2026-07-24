import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { useRef, useState } from 'react';
import { IlaMark } from '@ila/ui';
import { UtilityBar } from '../../components/layout/UtilityBar';
import { Composer } from '../../components/chat/Composer';
import { MessageBubble } from '../../components/chat/MessageBubble';
import { LoginScreen } from '../../components/auth/LoginScreen';
import { useAuth } from '../../lib/useAuth';
import './style.css';

export default function App() {
  const { status, user, signOut } = useAuth();
  const { messages, setMessages } = useChat();
  const [input, setInput] = useState('');
  const content = useRef<HTMLDivElement>(null);

  const newChat = () => {
    setMessages([]);
    setInput('');
  };

  const submit = () => {
    const text = input.trim();
    if (!text) return;

    const userMsg: UIMessage = { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] };
    const assistantMsg: UIMessage = { 
      id: crypto.randomUUID(), 
      role: 'assistant', 
      parts: [{ type: 'text', text: text }] 
    };

    setMessages(current => [...current, userMsg, assistantMsg]);
    setInput('');
    
    setTimeout(() => {
      if (content.current) {
        content.current.scrollTo({ top: content.current.scrollHeight, behavior: 'smooth' });
      }
    }, 50);
  };

  if (status === 'loading') {
    return (
      <main className="flex h-[100dvh] min-w-[300px] items-center justify-center bg-gradient-to-b from-[#fbfbfb] to-[#fdfdfd] text-[#bbb]">
        <IlaMark large />
      </main>
    );
  }

  if (status === 'unauthenticated') {
    return <LoginScreen />;
  }

  return (
    <main className="relative flex flex-col h-[100dvh] min-w-[300px] overflow-hidden bg-gradient-to-b from-[#fbfbfb] to-[#fdfdfd] text-[#181818]">
      <UtilityBar onNew={newChat} user={user} onSignOut={signOut} />
      
      <div className="flex-1 overflow-auto px-4 md:px-[42px] pt-[26px] pb-[200px] scrollbar-thin" ref={content}>
        {messages.length > 0 ? (
          <div className="flex flex-col gap-8 pb-4">
            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        ) : (
          <div className="min-h-full flex flex-col items-center justify-center gap-5 text-[#bbb] text-[13px]">
            <IlaMark large />
            <span>Ask ILA anything about this page</span>
          </div>
        )}
      </div>

      <div className="absolute z-10 left-3 right-3 md:left-[28px] md:right-[28px] bottom-3 md:bottom-[25px]">
        <Composer value={input} setValue={setInput} onSubmit={submit} />
      </div>
    </main>
  );
}
