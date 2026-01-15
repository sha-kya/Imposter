import React, { useState, useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { Button } from './components/Button';
import { Input } from './components/Input';
import { generateGameContent, generateUndercoverContent, generateHint, generateImposterHintOnly } from './services/geminiService';
import { getPresetCategories, getRandomPreset, getUndercoverPresetCategories, getRandomUndercoverPreset } from './services/presetService';
import { GamePhase, Player, GameState, Difficulty, GameMode } from './types';
import { Users, User, ArrowRight, Eye, EyeOff, RefreshCcw, BrainCircuit, AlertCircle, Zap, Skull, Timer, Fingerprint, Lock, Lightbulb, Play, Infinity as InfinityIcon, HelpCircle, PenTool, Library, Grid, Dices, X, Ghost } from 'lucide-react';

const INITIAL_STATE: GameState = {
  phase: GamePhase.MODE_SELECTION,
  mode: GameMode.AI_RANDOM,
  playerCount: 4,
  category: '',
  secretWord: '',
  players: [],
  currentPlayerIndex: 0,
  imposterIndex: null,
  startingPlayerId: 1,
  difficulty: 'MEDIUM',
  timerDuration: 300, // 5 minutes default
  timeLeft: 300,
  hints: [],
  imposterHintEnabled: false,
  imposterHint: null,
  customWords: [],
  customInputIndex: 0,
  imposterWord: null,
};

function App() {
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  
  // Animation & Interaction States
  const [revealMode, setRevealMode] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false); // For the scanning animation
  const [loading, setLoading] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Custom Mode Input State
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [customWordInput, setCustomWordInput] = useState('');

  // Timer Customization State
  const [isCustomTimer, setIsCustomTimer] = useState(false);
  const [customTimeInput, setCustomTimeInput] = useState('10');

  // Forgot Word Modal State
  const [forgotModal, setForgotModal] = useState<{
    isOpen: boolean;
    step: 'SELECT' | 'CONFIRM' | 'REVEAL';
    playerId: number | null;
  }>({ isOpen: false, step: 'SELECT', playerId: null });

  // Timer Ref
  const timerRef = useRef<any>(null);

  // -- Effects --

  useEffect(() => {
    // Only run timer if duration is set (greater than 0)
    // Timer continues running even if Forgot Modal is open, as phase is still GAME_ACTIVE
    if (gameState.phase === GamePhase.GAME_ACTIVE && gameState.timerDuration > 0 && gameState.timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setGameState(prev => ({
          ...prev,
          timeLeft: Math.max(0, prev.timeLeft - 1)
        }));
      }, 1000);
    } else if (gameState.timeLeft === 0) {
       if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState.phase, gameState.timeLeft, gameState.timerDuration]);

  // -- Handlers --

  const selectMode = (mode: GameMode) => {
    setGameState(prev => ({
      ...prev,
      mode,
      phase: GamePhase.SETUP,
      // Reset relevant fields
      category: (mode === GameMode.PRESET || mode === GameMode.PRESET_UNDERCOVER) ? 'Random' : '',
      difficulty: 'MEDIUM',
      imposterHintEnabled: mode === GameMode.AI_RANDOM, // Default on only for AI Random
    }));
  };

  const handleStartSetup = async () => {
    // Validation
    if ((gameState.mode === GameMode.AI_RANDOM || gameState.mode === GameMode.AI_UNDERCOVER) && !gameState.category.trim()) {
      setError("Please enter a category");
      return;
    }
    if (gameState.playerCount < 3) {
      setError("Minimum 3 players required");
      return;
    }

    // Logic Branching based on Mode
    if (gameState.mode === GameMode.CUSTOM) {
      setGameState(prev => ({
        ...prev,
        phase: GamePhase.CUSTOM_INPUT,
        customInputIndex: 0,
        customWords: []
      }));
      setCustomCategoryInput('');
      setCustomWordInput('');
      setError(null);
      return;
    }

    if (gameState.mode === GameMode.PRESET) {
      await handleStartGamePreset();
      return;
    }

    if (gameState.mode === GameMode.PRESET_UNDERCOVER) {
      await handleStartGamePresetUndercover();
      return;
    }

    if (gameState.mode === GameMode.AI_RANDOM || gameState.mode === GameMode.AI_UNDERCOVER) {
      await handleStartGameAI();
      return;
    }
  };

  const handleCustomInputSubmit = () => {
    if (!customCategoryInput.trim() || !customWordInput.trim()) {
      setError("Please fill in both fields");
      return;
    }

    const nextIndex = gameState.customInputIndex + 1;
    const newCustomWords = [
      ...gameState.customWords,
      { 
        playerId: gameState.customInputIndex + 1,
        category: customCategoryInput, 
        word: customWordInput 
      }
    ];

    if (nextIndex < gameState.playerCount) {
      // Next player input
      setGameState(prev => ({
        ...prev,
        customWords: newCustomWords,
        customInputIndex: nextIndex
      }));
      setCustomCategoryInput('');
      setCustomWordInput('');
      setError(null);
    } else {
      // All inputs done, start game
      const randomPick = newCustomWords[Math.floor(Math.random() * newCustomWords.length)];
      initializeGame(randomPick.word, randomPick.category, null);
    }
  };

  const handleStartGamePreset = async () => {
    setLoading(true);
    try {
      const { word, category } = getRandomPreset(gameState.difficulty, gameState.category);
      
      let imposterHint = null;
      if (gameState.imposterHintEnabled) {
         imposterHint = await generateImposterHintOnly(category, word);
      }
      
      initializeGame(word, category, imposterHint);
    } catch (e) {
      console.error(e);
      setError("Failed to start game.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartGamePresetUndercover = async () => {
    setLoading(true);
    try {
      const { secretWord, imposterWord, category } = getRandomUndercoverPreset(gameState.difficulty, gameState.category);
      initializeGame(secretWord, category, null, imposterWord);
    } catch (e) {
      console.error(e);
      setError("Failed to start game.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartGameAI = async () => {
    setLoading(true);
    setError(null);
    try {
      if (gameState.mode === GameMode.AI_UNDERCOVER) {
        const data = await generateUndercoverContent(gameState.category, gameState.difficulty);
        initializeGame(data.secretWord, gameState.category, null, data.imposterWord);
      } else {
        const data = await generateGameContent(
          gameState.category, 
          gameState.difficulty, 
          gameState.imposterHintEnabled
        );
        initializeGame(data.secretWord, gameState.category, data.imposterHint || null);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to generate word. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const initializeGame = (secretWord: string, category: string, imposterHint: string | null, imposterWord: string | null = null) => {
    const imposterIdx = Math.floor(Math.random() * gameState.playerCount);
    // Random starting player (1-based index)
    const startId = Math.floor(Math.random() * gameState.playerCount) + 1;

    const newPlayers: Player[] = Array.from({ length: gameState.playerCount }, (_, i) => ({
      id: i + 1,
      isImposter: i === imposterIdx,
    }));

    setGameState(prev => ({
      ...prev,
      phase: GamePhase.PASS_DEVICE,
      secretWord,
      category,
      imposterHint,
      imposterWord,
      imposterIndex: imposterIdx,
      startingPlayerId: startId,
      players: newPlayers,
      currentPlayerIndex: 0,
      timeLeft: prev.timerDuration,
      hints: [],
    }));
  };

  const handleNextPlayer = () => {
    setRevealMode(false);
    setIsRevealing(false);
    if (gameState.currentPlayerIndex < gameState.players.length - 1) {
      setGameState(prev => ({
        ...prev,
        currentPlayerIndex: prev.currentPlayerIndex + 1,
        phase: GamePhase.PASS_DEVICE
      }));
    } else {
      setGameState(prev => ({
        ...prev,
        phase: GamePhase.GAME_ACTIVE
      }));
    }
  };

  const startRevealAnimation = () => {
    setIsRevealing(true);
    setTimeout(() => {
      setIsRevealing(false);
      setRevealMode(true);
    }, 2000);
  };

  const handleGetHint = async () => {
    if (hintLoading) return;
    setHintLoading(true);
    try {
      const newHint = await generateHint(gameState.category, gameState.secretWord);
      setGameState(prev => ({
        ...prev,
        hints: [newHint, ...prev.hints]
      }));
    } catch (e) {
      console.error(e);
    } finally {
      setHintLoading(false);
    }
  };

  const handleReset = () => {
    setGameState(prev => ({
      ...INITIAL_STATE,
      // Persist some settings if desired, or full reset
      phase: GamePhase.MODE_SELECTION,
    }));
    setRevealMode(false);
    setIsRevealing(false);
    setError(null);
    setForgotModal({ isOpen: false, step: 'SELECT', playerId: null });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // -- Forgot Word Handlers --
  const openForgotModal = () => setForgotModal({ isOpen: true, step: 'SELECT', playerId: null });
  const closeForgotModal = () => setForgotModal({ isOpen: false, step: 'SELECT', playerId: null });
  const selectForgotPlayer = (id: number) => setForgotModal({ isOpen: true, step: 'CONFIRM', playerId: id });
  const confirmForgotIdentity = () => setForgotModal(prev => ({ ...prev, step: 'REVEAL' }));


  // -- Render Helpers --

  const QuitButton = () => (
     <Button 
        onClick={() => {
           if(window.confirm("Are you sure you want to quit? Current game progress will be lost.")) {
               handleReset();
           }
        }}
        variant="ghost"
        fullWidth
        className="mt-4 text-slate-500 hover:text-white hover:bg-slate-800/50 py-3 text-sm font-medium"
     >
        Return to Lobby
     </Button>
  );

  const DifficultyButton = ({ level, label, colorClass }: { level: Difficulty, label: string, colorClass: string }) => {
    const isSelected = gameState.difficulty === level;
    return (
      <button
        onClick={() => setGameState(prev => ({ ...prev, difficulty: level }))}
        className={`
          flex-1 py-3 px-2 rounded-xl text-xs sm:text-sm font-bold border transition-all duration-200
          ${isSelected 
            ? `${colorClass} ring-2 ring-offset-2 ring-offset-slate-900 ring-white/20` 
            : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750"}
        `}
      >
        {label}
      </button>
    );
  };

  const renderModeSelection = () => (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-6 w-full max-w-lg">
      <div className="text-center mb-2">
        <div className="bg-indigo-500/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-400 shadow-xl shadow-indigo-900/20">
          <BrainCircuit size={32} />
        </div>
        <h1 className="text-4xl font-black tracking-tight text-white mb-2">Imposter</h1>
        <p className="text-slate-400">Select your game mode</p>
      </div>

      <div className="grid gap-3">
        {/* AI Modes Row */}
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => selectMode(GameMode.AI_RANDOM)}
            className="bg-slate-800 hover:bg-slate-750 border border-slate-700 p-5 rounded-2xl text-left transition-all hover:scale-[1.02] group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-indigo-500/5 group-hover:bg-indigo-500/10 transition-colors" />
            <div className="flex flex-col gap-3 relative">
              <div className="bg-indigo-500/20 p-2 w-fit rounded-lg text-indigo-400">
                <Zap size={20} />
              </div>
              <div>
                <h3 className="font-bold text-md text-white">AI Classic</h3>
                <p className="text-slate-500 text-xs">AI generated words</p>
              </div>
            </div>
          </button>

          <button 
            onClick={() => selectMode(GameMode.AI_UNDERCOVER)}
            className="bg-slate-800 hover:bg-slate-750 border border-slate-700 p-5 rounded-2xl text-left transition-all hover:scale-[1.02] group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-purple-500/5 group-hover:bg-purple-500/10 transition-colors" />
            <div className="flex flex-col gap-3 relative">
              <div className="bg-purple-500/20 p-2 w-fit rounded-lg text-purple-400">
                <Ghost size={20} />
              </div>
              <div>
                <h3 className="font-bold text-md text-white">AI Undercover</h3>
                <p className="text-slate-500 text-xs">Imposter gets word</p>
              </div>
            </div>
          </button>
        </div>

        {/* Preset Modes Row */}
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => selectMode(GameMode.PRESET)}
            className="bg-slate-800 hover:bg-slate-750 border border-slate-700 p-5 rounded-2xl text-left transition-all hover:scale-[1.02] group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-orange-500/5 group-hover:bg-orange-500/10 transition-colors" />
            <div className="flex flex-col gap-3 relative">
               <div className="bg-orange-500/20 p-2 w-fit rounded-lg text-orange-400">
                 <Grid size={20} />
              </div>
              <div>
                <h3 className="font-bold text-md text-white">Preset</h3>
                <p className="text-slate-500 text-xs">Offline categories</p>
              </div>
            </div>
          </button>

          <button 
            onClick={() => selectMode(GameMode.PRESET_UNDERCOVER)}
            className="bg-slate-800 hover:bg-slate-750 border border-slate-700 p-5 rounded-2xl text-left transition-all hover:scale-[1.02] group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-pink-500/5 group-hover:bg-pink-500/10 transition-colors" />
            <div className="flex flex-col gap-3 relative">
               <div className="bg-pink-500/20 p-2 w-fit rounded-lg text-pink-400">
                 <Library size={20} />
              </div>
              <div>
                <h3 className="font-bold text-md text-white">Preset UC</h3>
                <p className="text-slate-500 text-xs">Offline Undercover</p>
              </div>
            </div>
          </button>
        </div>

        {/* Custom Mode */}
        <button 
          onClick={() => selectMode(GameMode.CUSTOM)}
          className="bg-slate-800 hover:bg-slate-750 border border-slate-700 p-5 rounded-2xl text-left transition-all hover:scale-[1.02] group relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-emerald-500/5 group-hover:bg-emerald-500/10 transition-colors" />
          <div className="flex items-center gap-4 relative">
            <div className="bg-emerald-500/20 p-3 rounded-xl text-emerald-400">
                <Users size={24} />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">Custom</h3>
              <p className="text-slate-500 text-sm">Write your own</p>
            </div>
          </div>
        </button>
      </div>

      <div className="text-center mt-4 text-xs text-slate-600 font-medium">
          Created by Shakya Madanayake
      </div>
    </div>
  );

  const renderSetup = () => (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex items-center gap-4 mb-2">
        <button onClick={handleReset} className="p-2 rounded-full hover:bg-slate-800 text-slate-400 transition-colors">
          <ArrowRight className="rotate-180" size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-black text-white">
            {gameState.mode === GameMode.AI_RANDOM ? "Classic Setup" : 
             gameState.mode === GameMode.AI_UNDERCOVER ? "Undercover Setup" :
             gameState.mode === GameMode.PRESET_UNDERCOVER ? "Undercover Preset" :
             gameState.mode === GameMode.CUSTOM ? "Custom Setup" : "Preset Setup"}
          </h1>
          <p className="text-sm text-slate-400">Configure your game</p>
        </div>
      </div>

      <div className="space-y-6 bg-slate-800/50 p-6 rounded-2xl border border-slate-700/50 shadow-xl">
        
        {/* Category Input - For AI modes */}
        {(gameState.mode === GameMode.AI_RANDOM || gameState.mode === GameMode.AI_UNDERCOVER) && (
          <Input 
            label="Category"
            placeholder="e.g. Animals, Kitchen Tools..."
            value={gameState.category}
            onChange={(e) => {
              setGameState(prev => ({ ...prev, category: e.target.value }));
              if(error) setError(null);
            }}
            autoFocus
          />
        )}

        {(gameState.mode === GameMode.PRESET || gameState.mode === GameMode.PRESET_UNDERCOVER) && (
           <div className="flex flex-col gap-2 w-full">
            <label className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Category</label>
            <select
              value={gameState.category}
              onChange={(e) => setGameState(prev => ({ ...prev, category: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none"
            >
              <option value="Random">Random Category</option>
              {gameState.mode === GameMode.PRESET 
                ? getPresetCategories().map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))
                : getUndercoverPresetCategories().map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))
              }
            </select>
          </div>
        )}

        {/* Player Count */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Number of Players</label>
          <div className="flex items-center gap-4">
            <Button 
              variant="secondary" 
              onClick={() => setGameState(s => ({ ...s, playerCount: Math.max(3, s.playerCount - 1) }))}
              className="w-12 h-12 flex items-center justify-center text-xl"
            >-</Button>
            <div className="flex-1 text-center text-2xl font-bold font-mono">{gameState.playerCount}</div>
            <Button 
              variant="secondary" 
              onClick={() => setGameState(s => ({ ...s, playerCount: Math.min(20, s.playerCount + 1) }))}
              className="w-12 h-12 flex items-center justify-center text-xl"
            >+</Button>
          </div>
        </div>

        {/* Difficulty Selector - Not for Custom */}
        {gameState.mode !== GameMode.CUSTOM && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Difficulty</label>
            <div className="grid grid-cols-4 gap-2">
              <DifficultyButton level="EASY" label="Easy" colorClass="bg-emerald-500/20 border-emerald-500 text-emerald-400" />
              <DifficultyButton level="MEDIUM" label="Med" colorClass="bg-blue-500/20 border-blue-500 text-blue-400" />
              <DifficultyButton level="HARD" label="Hard" colorClass="bg-orange-500/20 border-orange-500 text-orange-400" />
              <DifficultyButton level="INSANE" label="Wild" colorClass="bg-purple-500/20 border-purple-500 text-purple-400" />
            </div>
          </div>
        )}

        {/* Timer Selector */}
        <div className="space-y-2">
           <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Game Timer</label>
           <div className="grid grid-cols-4 gap-2">
              <button
                 onClick={() => {
                     setGameState(prev => ({ ...prev, timerDuration: 0 }));
                     setIsCustomTimer(false);
                 }}
                 className={`
                   flex-1 py-3 px-2 rounded-xl text-sm font-bold border transition-all flex items-center justify-center gap-2
                   ${!isCustomTimer && gameState.timerDuration === 0
                     ? "bg-slate-200 text-slate-900 border-slate-200 ring-2 ring-white/20"
                     : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750"}
                 `}
                 title="No Timer"
              >
                <InfinityIcon size={18} />
              </button>

              <button
                 onClick={() => {
                     setGameState(prev => ({ ...prev, timerDuration: 180 }));
                     setIsCustomTimer(false);
                 }}
                 className={`
                   flex-1 py-3 px-2 rounded-xl text-sm font-bold border transition-all
                   ${!isCustomTimer && gameState.timerDuration === 180
                     ? "bg-slate-200 text-slate-900 border-slate-200 ring-2 ring-white/20"
                     : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750"}
                 `}
              >
                3m
              </button>

              <button
                 onClick={() => {
                     setGameState(prev => ({ ...prev, timerDuration: 300 }));
                     setIsCustomTimer(false);
                 }}
                 className={`
                   flex-1 py-3 px-2 rounded-xl text-sm font-bold border transition-all
                   ${!isCustomTimer && gameState.timerDuration === 300
                     ? "bg-slate-200 text-slate-900 border-slate-200 ring-2 ring-white/20"
                     : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750"}
                 `}
              >
                5m
              </button>

              <button
                 onClick={() => {
                     setIsCustomTimer(true);
                     const mins = parseInt(customTimeInput) || 10;
                     setGameState(prev => ({ ...prev, timerDuration: mins * 60 }));
                 }}
                 className={`
                   flex-1 py-3 px-2 rounded-xl text-sm font-bold border transition-all
                   ${isCustomTimer
                     ? "bg-slate-200 text-slate-900 border-slate-200 ring-2 ring-white/20"
                     : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750"}
                 `}
              >
                Custom
              </button>
           </div>
           
           {isCustomTimer && (
              <div className="mt-3 animate-in slide-in-from-top-1 fade-in duration-200">
                <div className="relative">
                    <input 
                        type="number" 
                        min="1" 
                        max="120"
                        value={customTimeInput}
                        onChange={(e) => {
                            setCustomTimeInput(e.target.value);
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val > 0) {
                                setGameState(prev => ({ ...prev, timerDuration: val * 60 }));
                            }
                        }}
                        className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-16 font-mono text-lg"
                        placeholder="Min"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs tracking-wider pointer-events-none">
                        MINUTES
                    </div>
                </div>
              </div>
           )}
        </div>

        {/* Imposter Hints Toggle - Only Classic AI & Preset Modes */}
        {(gameState.mode === GameMode.AI_RANDOM || gameState.mode === GameMode.PRESET) && (
          <div className="flex items-center justify-between bg-slate-800 p-4 rounded-xl border border-slate-700">
            <div className="flex items-center gap-3">
               <div className="bg-orange-500/20 p-2 rounded-lg text-orange-400">
                  <HelpCircle size={20} />
               </div>
               <div>
                  <div className="font-bold text-sm text-slate-200">Imposter Help</div>
                  <div className="text-xs text-slate-500">Give imposter a subtle hint</div>
               </div>
            </div>
            <button 
               onClick={() => setGameState(prev => ({ ...prev, imposterHintEnabled: !prev.imposterHintEnabled }))}
               className={`
                 relative w-12 h-7 rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-indigo-500
                 ${gameState.imposterHintEnabled ? 'bg-indigo-600' : 'bg-slate-700'}
               `}
            >
               <span 
                 className={`
                   absolute left-1 top-1 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ease-in-out
                   ${gameState.imposterHintEnabled ? 'translate-x-5' : 'translate-x-0'}
                 `}
               />
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 p-3 rounded-lg border border-red-900/50 animate-pulse">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </div>

      <Button 
        onClick={handleStartSetup} 
        disabled={loading} 
        fullWidth
        className="text-lg py-4 shadow-indigo-500/25"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
            Generating...
          </span>
        ) : (
          gameState.mode === GameMode.CUSTOM ? "Start Custom Input" : "Start Game"
        )}
      </Button>
    </div>
  );

  const renderCustomInput = () => (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="text-center mb-4">
         <div className="bg-emerald-500/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-emerald-400 shadow-xl shadow-emerald-900/20 animate-bounce-slow">
          <PenTool size={32} />
        </div>
        <h2 className="text-3xl font-black text-white">Player {gameState.customInputIndex + 1}</h2>
        <p className="text-slate-400">Create a word for the game</p>
      </div>

      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700/50 shadow-xl space-y-6">
        <Input 
          label="Category"
          placeholder="e.g. Vacation Spots"
          value={customCategoryInput}
          onChange={(e) => {
             setCustomCategoryInput(e.target.value);
             if(error) setError(null);
          }}
          autoFocus
        />
        <Input 
          label="Secret Word"
          placeholder="e.g. Hawaii"
          value={customWordInput}
          onChange={(e) => {
             setCustomWordInput(e.target.value);
             if(error) setError(null);
          }}
        />
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 p-3 rounded-lg border border-red-900/50 animate-pulse">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </div>

      <div className="text-center text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">
         Pass to next player after submitting
      </div>

      <Button 
        onClick={handleCustomInputSubmit}
        fullWidth
        className="text-lg py-4"
      >
        {gameState.customInputIndex === gameState.playerCount - 1 ? "Submit & Start Game" : "Next Player"}
      </Button>
    </div>
  );

  const renderPassDevice = () => (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-8 text-center animate-in zoom-in-95 duration-500">
      <div className="relative">
         <div className="bg-slate-800 p-10 rounded-full border-4 border-slate-700 shadow-2xl z-10 relative animate-bounce-slow">
            <Users size={64} className="text-slate-200" />
         </div>
         <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-3xl animate-pulse"></div>
      </div>
      
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-400 tracking-tight">Pass the device to</h2>
        <div className="text-6xl font-black text-white bg-clip-text text-transparent bg-gradient-to-br from-white to-slate-400">
          Player {gameState.players[gameState.currentPlayerIndex].id}
        </div>
      </div>

      <div className="w-full bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 max-w-xs mx-auto">
        <p className="text-sm text-slate-400">Make sure no one else is looking at the screen.</p>
      </div>

      <Button 
        onClick={() => setGameState(prev => ({ ...prev, phase: GamePhase.REVEAL_ROLE }))}
        fullWidth
        className="mt-4 text-lg py-4 flex items-center justify-center gap-2 group"
      >
        <Lock size={20} className="group-hover:unlock" />
        I am Player {gameState.players[gameState.currentPlayerIndex].id}
      </Button>

      <QuitButton />
    </div>
  );

  const renderRevealRole = () => {
    const player = gameState.players[gameState.currentPlayerIndex];
    const isImposter = player.isImposter;
    
    // In Undercover mode, the imposter sees a normal card but with their specific imposter word.
    const isUndercoverMode = gameState.mode === GameMode.AI_UNDERCOVER || gameState.mode === GameMode.PRESET_UNDERCOVER;
    const showImposterScreen = isImposter && !isUndercoverMode;
    const wordToDisplay = (isImposter && isUndercoverMode) ? gameState.imposterWord : gameState.secretWord;

    return (
      <div className="flex flex-col items-center gap-6 w-full animate-in fade-in duration-300">
        <div className="w-full text-center mb-2">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800 text-slate-300 text-sm font-bold border border-slate-700">
            <User size={16} /> Player {player.id}
          </span>
        </div>

        {/* The Card */}
        <div className="w-full aspect-[4/5] max-h-[450px] relative perspective-1000" onClick={!revealMode && !isRevealing ? startRevealAnimation : undefined}>
          <div className={`
             w-full h-full rounded-3xl transition-all duration-500 flex flex-col items-center justify-center p-8 text-center border-2 shadow-2xl overflow-hidden relative
             ${isRevealing ? "bg-slate-900 border-indigo-500/50 scale-95" : ""}
             ${!revealMode && !isRevealing ? "bg-slate-800 border-slate-700 hover:border-slate-500 cursor-pointer hover:scale-[1.02]" : ""}
             ${revealMode && showImposterScreen ? "bg-red-950 border-red-500" : ""}
             ${revealMode && !showImposterScreen ? "bg-indigo-950 border-indigo-500" : ""}
          `}>
            
            {/* Scanning State */}
            {isRevealing && (
               <div className="flex flex-col items-center gap-4 text-indigo-400 animate-in fade-in duration-200">
                  <div className="relative">
                    <Fingerprint size={80} className="animate-pulse" />
                    <div className="absolute inset-0 border-t-2 border-indigo-400 animate-[scan_1.5s_ease-in-out_infinite] opacity-50"></div>
                  </div>
                  <div className="text-xl font-mono font-bold tracking-widest uppercase animate-pulse">Decrypting Role...</div>
               </div>
            )}

            {/* Hidden State */}
            {!revealMode && !isRevealing && (
              <div className="flex flex-col items-center gap-6 text-slate-500">
                <div className="p-6 rounded-full bg-slate-900 border border-slate-800">
                   <Fingerprint size={64} />
                </div>
                <div className="space-y-1">
                   <p className="text-2xl font-bold text-slate-300">Tap to Reveal</p>
                   <p className="text-sm">Keep your screen hidden</p>
                </div>
              </div>
            )}

            {/* Revealed State */}
            {revealMode && (
              <div className="animate-in zoom-in-75 duration-300 flex flex-col items-center gap-4 w-full h-full justify-center">
                 {showImposterScreen ? (
                    <>
                      <div className="p-5 bg-red-500/20 rounded-full animate-bounce-slow">
                        <Skull size={48} className="text-red-500" />
                      </div>
                      <div className="space-y-1">
                         <h2 className="text-4xl font-black text-red-500 uppercase tracking-tighter">Imposter</h2>
                         <p className="text-red-200/80 font-medium text-sm">You don't know the word.</p>
                      </div>
                      
                      <div className="w-full p-3 bg-red-900/40 rounded-xl border border-red-500/30 flex flex-col gap-1">
                         <span className="text-red-300/60 text-[10px] uppercase tracking-widest font-bold">Category</span>
                         <div className="text-lg text-white font-bold">{gameState.category}</div>
                      </div>

                      {gameState.imposterHint && (
                        <div className="w-full p-3 bg-orange-900/40 rounded-xl border border-orange-500/30 flex flex-col gap-1 animate-in slide-in-from-bottom-2 delay-300">
                           <div className="flex items-center justify-center gap-1.5 text-orange-400">
                              <HelpCircle size={12} />
                              <span className="text-[10px] uppercase tracking-widest font-bold">Hint</span>
                           </div>
                           <div className="text-md text-orange-200 italic font-medium leading-tight">"{gameState.imposterHint}"</div>
                        </div>
                      )}
                    </>
                 ) : (
                    <>
                       <div className="p-6 bg-indigo-500/20 rounded-full">
                         <BrainCircuit size={64} className="text-indigo-400" />
                       </div>
                       <div className="space-y-2">
                         <h2 className="text-xl font-bold text-indigo-300 uppercase tracking-widest">Secret Word</h2>
                         <p className="text-5xl font-black text-white break-all leading-tight">{wordToDisplay}</p>
                       </div>
                       <p className="text-slate-400 text-sm mt-2">Blend in. Find the liar.</p>
                    </>
                 )}
              </div>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="w-full mt-2">
          {revealMode ? (
             <Button onClick={handleNextPlayer} fullWidth variant="primary" className="py-4 text-lg">
               {gameState.currentPlayerIndex === gameState.players.length - 1 ? "Start Game" : "Hide & Pass Device"}
             </Button>
          ) : (
             <div className="h-14 flex items-center justify-center text-slate-600 text-sm font-mono">
               {!isRevealing && "Identity Secured"}
             </div>
          )}
        </div>

        <QuitButton />
      </div>
    );
  };

  const renderForgotModal = () => {
    if (!forgotModal.isOpen) return null;
    
    // In Undercover mode, we must maintain the illusion for the imposter
    const isUndercoverMode = gameState.mode === GameMode.AI_UNDERCOVER || gameState.mode === GameMode.PRESET_UNDERCOVER;

    return (
       <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-sm p-6 animate-in fade-in duration-200">
          <button onClick={closeForgotModal} className="absolute top-6 right-6 p-2 rounded-full bg-slate-800 text-slate-400">
             <X size={24} />
          </button>

          {forgotModal.step === 'SELECT' && (
             <div className="w-full max-w-md text-center space-y-6">
                <h2 className="text-2xl font-bold text-white">Who needs a reminder?</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                   {gameState.players.map(p => (
                      <button
                        key={p.id}
                        onClick={() => selectForgotPlayer(p.id)}
                        className="p-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl font-bold text-lg text-white transition-colors"
                      >
                         Player {p.id}
                      </button>
                   ))}
                </div>
             </div>
          )}

          {forgotModal.step === 'CONFIRM' && (
             <div className="w-full max-w-sm text-center space-y-8">
                <div className="space-y-2">
                   <h2 className="text-2xl font-bold text-white">Pass to Player {forgotModal.playerId}</h2>
                   <p className="text-slate-400">Ensure no one else is looking</p>
                </div>
                <div className="bg-slate-900 p-8 rounded-full inline-block border-2 border-slate-800">
                   <Lock size={48} className="text-indigo-500" />
                </div>
                <Button onClick={confirmForgotIdentity} fullWidth>
                   I am Player {forgotModal.playerId}
                </Button>
                <button onClick={() => setForgotModal(prev => ({...prev, step: 'SELECT'}))} className="text-slate-500 text-sm hover:text-white">
                   Go Back
                </button>
             </div>
          )}

          {forgotModal.step === 'REVEAL' && (
             <div className="w-full max-w-sm text-center space-y-6">
                 {(() => {
                    const player = gameState.players.find(p => p.id === forgotModal.playerId);
                    const isImposter = player?.isImposter;
                    
                    const showImposterScreen = isImposter && !isUndercoverMode;
                    const wordToDisplay = (isImposter && isUndercoverMode) ? gameState.imposterWord : gameState.secretWord;

                    return (
                       <div className={`
                          p-8 rounded-3xl border-2 shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in-95
                          ${showImposterScreen ? "bg-red-950 border-red-500" : "bg-indigo-950 border-indigo-500"}
                       `}>
                          {showImposterScreen ? (
                             <>
                                <Skull size={64} className="text-red-500" />
                                <h2 className="text-3xl font-black text-red-500 uppercase">Imposter</h2>
                                <div className="p-3 bg-red-900/40 rounded-xl w-full">
                                   <div className="text-xs uppercase text-red-300 font-bold mb-1">Category</div>
                                   <div className="text-white font-bold">{gameState.category}</div>
                                </div>
                                {gameState.imposterHint && (
                                   <div className="text-sm text-orange-200 italic">"{gameState.imposterHint}"</div>
                                )}
                             </>
                          ) : (
                             <>
                                <BrainCircuit size={64} className="text-indigo-400" />
                                <div className="space-y-2">
                                   <div className="text-xs uppercase text-indigo-300 font-bold">Secret Word</div>
                                   <div className="text-3xl font-black text-white">{wordToDisplay}</div>
                                </div>
                             </>
                          )}
                       </div>
                    );
                 })()}
                 <Button onClick={closeForgotModal} fullWidth variant="secondary">
                    Close & Resume
                 </Button>
             </div>
          )}
       </div>
    );
  };

  const renderGameActive = () => (
    <div className="flex flex-col items-center gap-6 animate-in fade-in duration-500 text-center w-full relative">
      {renderForgotModal()}

      {/* Timer */}
      {gameState.timerDuration > 0 && (
        <div className={`
           flex items-center gap-3 px-6 py-3 rounded-full border-2 font-mono text-2xl font-bold shadow-lg transition-colors
           ${gameState.timeLeft < 30 ? "bg-red-950 border-red-500 text-red-500 animate-pulse" : "bg-slate-800 border-slate-700 text-slate-200"}
        `}>
           <Timer size={24} />
           {formatTime(gameState.timeLeft)}
        </div>
      )}

      {/* Who Starts Badge */}
      <div className="w-full flex justify-center">
         <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/10 border border-indigo-500/20 px-6 py-3 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-4 delay-150">
            <Dices size={20} className="text-indigo-400" />
            <span className="text-slate-300 font-medium">Player <span className="text-white font-bold text-lg">{gameState.startingPlayerId}</span> starts!</span>
         </div>
      </div>

      <div className="space-y-1">
        <h1 className="text-3xl font-bold text-white">Find the Imposter</h1>
        <p className="text-slate-400 text-sm">Discuss and vote out the liar</p>
      </div>

      {/* Info Card */}
      <div className="w-full bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 flex flex-col gap-3">
        <div className="flex justify-between items-center border-b border-slate-700/50 pb-3">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Category</span>
          <span className="text-lg font-bold text-white">{gameState.category}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Difficulty</span>
          <span className={`text-sm font-bold px-2 py-0.5 rounded
            ${gameState.difficulty === 'EASY' ? 'bg-emerald-500/10 text-emerald-400' : 
              gameState.difficulty === 'MEDIUM' ? 'bg-blue-500/10 text-blue-400' :
              gameState.difficulty === 'HARD' ? 'bg-orange-500/10 text-orange-400' : 'bg-purple-500/10 text-purple-400'
            }`}>
            {gameState.mode === GameMode.CUSTOM ? "USER" : gameState.difficulty}
          </span>
        </div>
      </div>

      {/* Hint System */}
      <div className="w-full space-y-3">
        {gameState.hints.length > 0 && (
           <div className="bg-indigo-900/30 border border-indigo-500/30 p-4 rounded-xl text-left animate-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2 mb-2 text-indigo-300">
                 <Lightbulb size={16} />
                 <span className="text-xs font-bold uppercase tracking-wider">Discussion Topic</span>
              </div>
              <p className="text-indigo-100 font-medium">{gameState.hints[0]}</p>
           </div>
        )}
        
        <Button 
           onClick={handleGetHint} 
           disabled={hintLoading}
           variant="secondary" 
           fullWidth 
           className="py-3 flex items-center justify-center gap-2 text-sm"
        >
           {hintLoading ? <span className="animate-spin text-xl">⟳</span> : <Zap size={16} />}
           {gameState.hints.length === 0 ? "Get Discussion Starter" : "New Topic"}
        </Button>
      </div>

      <div className="w-full flex flex-col gap-3 pt-4 border-t border-slate-800">
          <button 
             onClick={openForgotModal}
             className="text-slate-500 text-sm font-medium hover:text-indigo-400 transition-colors py-2 flex items-center justify-center gap-2"
          >
             <HelpCircle size={16} /> Forgot your word?
          </button>

          <Button 
            onClick={() => setGameState(prev => ({ ...prev, phase: GamePhase.GAME_OVER }))} 
            fullWidth 
            variant="danger"
            className="py-5 text-xl shadow-red-900/20"
          >
            Reveal Results
          </Button>

          <QuitButton />
      </div>
    </div>
  );

  const renderGameOver = () => (
    <div className="flex flex-col items-center gap-8 animate-in zoom-in-95 duration-500 text-center w-full">
       <div className="space-y-2">
        <h1 className="text-4xl font-black text-white">Game Over</h1>
        <p className="text-slate-400">The truth is revealed.</p>
      </div>

      <div className="w-full space-y-4">
        <div className="bg-red-500/10 p-6 rounded-2xl border border-red-500/30 relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-10">
              <Skull size={100} />
           </div>
           <span className="text-xs font-bold text-red-400 uppercase tracking-widest">The Imposter Was</span>
           <div className="text-5xl font-black text-red-500 mt-2">Player {gameState.players[gameState.imposterIndex!].id}</div>
        </div>

        <div className="bg-indigo-500/10 p-6 rounded-2xl border border-indigo-500/30 relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-10">
              <BrainCircuit size={100} />
           </div>
           <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">The Secret Word Was</span>
           <div className="text-4xl font-bold text-white mt-2">{gameState.secretWord}</div>
        </div>

        {(gameState.mode === GameMode.AI_UNDERCOVER || gameState.mode === GameMode.PRESET_UNDERCOVER) && gameState.imposterWord && (
          <div className="bg-purple-500/10 p-6 rounded-2xl border border-purple-500/30 relative overflow-hidden animate-in slide-in-from-bottom-4">
             <div className="absolute top-0 right-0 p-4 opacity-10">
                <Ghost size={100} />
             </div>
             <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">Imposter's Secret Word Was</span>
             <div className="text-4xl font-bold text-white mt-2">{gameState.imposterWord}</div>
          </div>
        )}
      </div>

      <Button onClick={handleReset} fullWidth variant="secondary" className="mt-8 gap-2 flex items-center justify-center py-4 text-lg">
        <RefreshCcw size={20} /> Play Again
      </Button>
    </div>
  );

  return (
    <Layout>
      {gameState.phase === GamePhase.MODE_SELECTION && renderModeSelection()}
      {gameState.phase === GamePhase.SETUP && renderSetup()}
      {gameState.phase === GamePhase.CUSTOM_INPUT && renderCustomInput()}
      {gameState.phase === GamePhase.PASS_DEVICE && renderPassDevice()}
      {gameState.phase === GamePhase.REVEAL_ROLE && renderRevealRole()}
      {gameState.phase === GamePhase.GAME_ACTIVE && renderGameActive()}
      {gameState.phase === GamePhase.GAME_OVER && renderGameOver()}
    </Layout>
  );
}

export default App;