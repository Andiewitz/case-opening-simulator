export const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

let caseOpenAudio: HTMLAudioElement | null = null;
let caseOpenDuration = 11.5; // Default fallback duration

export function preloadCaseOpenSound() {
    if (!caseOpenAudio) {
        caseOpenAudio = new Audio('/csgo-case-open.mp3');
        caseOpenAudio.preload = 'auto';
        caseOpenAudio.addEventListener('loadedmetadata', () => {
            if (caseOpenAudio) {
                caseOpenDuration = caseOpenAudio.duration;
            }
        });
    }
}

export function playCaseOpenSound() {
    if (caseOpenAudio) {
        caseOpenAudio.currentTime = 0;
        caseOpenAudio.play().catch(e => console.error("Audio play failed:", e));
    }
}

export function stopCaseOpenSound() {
    if (caseOpenAudio) {
        caseOpenAudio.pause();
        caseOpenAudio.currentTime = 0;
    }
}

export function getCaseOpenDuration() {
    return caseOpenDuration;
}

export function playTick() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime); // High pitch tick
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);

    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
}

export function playReveal(rarityColor: string) {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    // Play a chord based on rarity
    const baseFreq = rarityColor === '#ffd700' || rarityColor === '#eb4b4b' ? 440 : 220; // A4 or A3
    
    const freqs = [baseFreq, baseFreq * 1.25, baseFreq * 1.5]; // Major chord elements
    
    freqs.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.type = rarityColor === '#ffd700' ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 2);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.start(audioCtx.currentTime + (i * 0.05)); // Staggered arpeggio
        osc.stop(audioCtx.currentTime + 2);
    });
}

export function playSell() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(500, audioCtx.currentTime); 
    osc.frequency.setValueAtTime(800, audioCtx.currentTime + 0.1); 

    gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
}
