
// Simple Web Audio API Synthesizer for Retro SFX
// No external files required.

let audioCtx: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextClass = window.AudioContext || audioWindow.webkitAudioContext;
    if (!AudioContextClass) return null;

    try {
        audioCtx ??= new AudioContextClass();
        return audioCtx;
    } catch {
        return null;
    }
};

const unlockAudio = (): void => {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === 'suspended') {
        void context.resume().catch(() => undefined);
    }
};

if (typeof window !== 'undefined') {
    // Creating/resuming Web Audio from a real pointer or keyboard event avoids
    // autoplay warnings. Programmatic timers simply stay silent until then.
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });
}

export const playSound = (type: 'type' | 'click' | 'alert' | 'explosion' | 'radio') => {
    if (!audioCtx || audioCtx.state !== 'running') return;

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'type') {
        // High pitched short blip (Mechanical Typewriter tick)
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);
        gainNode.gain.setValueAtTime(0.05, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    } 
    else if (type === 'click') {
        // Soft UI Click
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    }
    else if (type === 'alert') {
        // Red Alert Siren
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(880, now + 0.5);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
    }
    else if (type === 'explosion') {
        // Noise buffer for explosion
        const bufferSize = audioCtx.sampleRate * 0.5; // 0.5 seconds
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const noiseGain = audioCtx.createGain();
        noise.connect(noiseGain);
        noiseGain.connect(audioCtx.destination);
        
        // Low pass filter to make it sound like a thud/boom
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 100;
        noise.disconnect();
        noise.connect(filter);
        filter.connect(noiseGain);

        noiseGain.gain.setValueAtTime(0.5, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        noise.start(now);
        noise.stop(now + 0.5);
    }
    else if (type === 'radio') {
        // Static noise for radio
        const bufferSize = audioCtx.sampleRate * 0.2;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 0.5 - 0.25;
        }
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        
        // High pass for "tinny" radio sound
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 1000;
        
        noise.connect(filter);
        filter.connect(gainNode);
        
        gainNode.gain.setValueAtTime(0.05, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.2);
        
        noise.start(now);
        noise.stop(now + 0.2);
    }
};
