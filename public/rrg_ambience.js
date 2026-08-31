/* RRG build-ambience library — INDUSTRIAL set. Ten selectable sounds plus "off".
   Each sound.build(ctx, out) creates nodes on the provided GainNode `out`
   (the caller owns master volume + fade) and returns a handle with stop().
   Deliberately light: modest gains, mid-range tones, filtered noise, quick
   envelopes, no feedback loops — factory-floor character without frying a laptop
   speaker or pinning the CPU. Nothing sustained sits below ~90 Hz. */
(function(){
  function mkHandle(){
    return { oscs:[], ivs:[], _stopped:false,
      add:function(o){ this.oscs.push(o); return o; },
      iv:function(i){ this.ivs.push(i); return i; },
      stop:function(){ if(this._stopped) return; this._stopped=true; var s=this;
        s.ivs.forEach(function(i){ try{ clearInterval(i); }catch(e){} });
        setTimeout(function(){ s.oscs.forEach(function(o){ try{ o.stop(); }catch(e){} }); }, 750); } };
  }
  function O(ctx,type,freq){ var o=ctx.createOscillator(); o.type=type; o.frequency.value=freq; return o; }
  function BQ(ctx,type,freq,q){ var f=ctx.createBiquadFilter(); f.type=type; f.frequency.value=freq; if(q!=null) f.Q.value=q; return f; }
  function G(ctx,v){ var g=ctx.createGain(); g.gain.value=(v==null?1:v); return g; }
  // gentle tremolo LFO onto a gain param
  function breath(ctx,param,rate,depth,h){ var l=O(ctx,'sine',rate), lg=G(ctx,depth); l.connect(lg); lg.connect(param); l.start(); h.add(l); }
  // one-shot swell/fade note that stops itself
  function note(ctx,dest,type,freq,t,peak,att,dur){
    var o=O(ctx,type,freq), g=G(ctx,0.0001); o.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+att); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.start(t); o.stop(t+dur+0.05);
  }
  // shared looping white-noise buffer (2s), reused per build
  function noiseBuf(ctx){ var len=Math.floor(ctx.sampleRate*2), b=ctx.createBuffer(1,len,ctx.sampleRate), d=b.getChannelData(0); for(var i=0;i<len;i++) d[i]=Math.random()*2-1; return b; }
  function noise(ctx,buf){ var s=ctx.createBufferSource(); s.buffer=buf; s.loop=true; return s; }
  // a burst of steam/hiss through a highpass
  function hiss(ctx,dest,buf,hpf,t,peak,att,dur){
    var s=noise(ctx,buf), hp=BQ(ctx,'highpass',hpf), g=G(ctx,0.0001); s.connect(hp); hp.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+att); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    s.start(t); s.stop(t+dur+0.05);
  }
  // a low mechanical piston thud (pitch drops fast, quick decay)
  function thud(ctx,dest,freq,t,peak){
    var o=O(ctx,'sine',freq), g=G(ctx,0.0001); o.connect(g); g.connect(dest);
    o.frequency.setValueAtTime(freq,t); o.frequency.exponentialRampToValueAtTime(freq*0.42,t+0.11);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+0.008); g.gain.exponentialRampToValueAtTime(0.0001,t+0.32);
    o.start(t); o.stop(t+0.36);
  }
  // a metallic clank/ring: inharmonic partials through bandpass, fast attack, ringing decay
  function clank(ctx,dest,base,t,peak,ring){
    var parts=[1,1.61,2.27,2.95,3.62];
    parts.forEach(function(r,i){
      var o=O(ctx,(i<2?'triangle':'square'),base*r), bp=BQ(ctx,'bandpass',base*r,7), g=G(ctx,0.0001);
      o.connect(bp); bp.connect(g); g.connect(dest);
      var p=peak/(i*0.9+1), dur=ring*(1-i*0.14);
      g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(p,t+0.004); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
      o.start(t); o.stop(t+dur+0.05);
    });
  }
  // a short percussive tick (bandpassed noise) — key click / gear
  function tick(ctx,dest,buf,cf,t,peak,dur){
    var s=noise(ctx,buf), bp=BQ(ctx,'bandpass',cf,4), g=G(ctx,0.0001); s.connect(bp); bp.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+0.003); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    s.start(t); s.stop(t+dur+0.03);
  }
  // a soft pitched ping / data blip
  function blip(ctx,dest,freq,t,peak,dur){ var o=O(ctx,'sine',freq), g=G(ctx,0.0001); o.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+dur); o.start(t); o.stop(t+dur+0.03); }
  // a soft paper-shuffle / desk texture (band-limited noise swell)
  function paper(ctx,dest,buf,cf,t,peak,dur){ var s=noise(ctx,buf), bp=BQ(ctx,'bandpass',cf,0.7), g=G(ctx,0.0001); s.connect(bp); bp.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+dur*0.2); g.gain.exponentialRampToValueAtTime(0.0001,t+dur); s.start(t); s.stop(t+dur+0.05); }
  // a warm hum chord bed through a lowpass, with a slow breath; returns the amp gain
  function humBed(ctx,out,h,voices,cutoff,gain,breathRate,breathDepth){
    var lp=BQ(ctx,'lowpass',cutoff||900); lp.connect(out);
    var amp=G(ctx,gain==null?0.08:gain); amp.connect(lp); if(breathRate) breath(ctx,amp.gain,breathRate,breathDepth||0.14,h);
    voices.forEach(function(d){ var o=O(ctx,'sine',d[0]),g=G(ctx,d[1]); o.connect(g); g.connect(amp); o.start(); h.add(o); });
    return { lp:lp, amp:amp };
  }
  // a gentle rising tone (the "section done" lift)
  function rise(ctx,dest,f0,f1,t,peak,dur){ var o=O(ctx,'sine',f0), g=G(ctx,0.0001); o.connect(g); g.connect(dest);
    o.frequency.setValueAtTime(f0,t); o.frequency.linearRampToValueAtTime(f1,t+dur*0.7);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+dur*0.35); g.gain.exponentialRampToValueAtTime(0.0001,t+dur); o.start(t); o.stop(t+dur+0.05); }

  // Real audio file, looped through the caller's gain (master fade + mute apply).
  function fileSound(id,name,desc,src){
    return { id:id, name:name, desc:desc, src:src, file:true,
      build:function(ctx,out){
        var h=mkHandle(), au=new Audio(); au.src=src; au.loop=true; au.preload='auto';
        try{ var node=ctx.createMediaElementSource(au); node.connect(out); }catch(e){}
        au.play().catch(function(){});
        h.audio=au;
        h.stop=function(){ if(this._stopped) return; this._stopped=true; setTimeout(function(){ try{ au.pause(); }catch(e){} }, 750); };
        return h;
      } };
  }
  // Real-audio tracks live here — populated as files are dropped into /sounds.
  var FILE_SOUNDS = [
    // e.g. fileSound('plant', 'Plant Floor', 'Recorded factory loop.', '/sounds/plant.mp3'),
  ];

  var SOUNDS=[
    { id:'analyst', name:'Soft Analytical Pulse', desc:'A warm hum with quiet ticks, subtle desk texture, and a gentle rise as it works.',
      build:function(ctx,out){ var h=mkHandle(), buf=noiseBuf(ctx);
        var bed=humBed(ctx,out,h,[[98,0.10],[147,0.05],[220,0.02]],900,0.08,0.08,0.14);
        h.iv(setInterval(function(){ try{ tick(ctx,out,buf,2600,ctx.currentTime,0.022,0.03); }catch(e){} }, 2600));
        var tk=0; h.iv(setInterval(function(){ try{ var t=ctx.currentTime; if(tk%2===0){ paper(ctx,out,buf,1900,t,0.028,0.5); } else { for(var k=0;k<4;k++){ tick(ctx,out,buf,3000+k*160,t+k*0.085,0.018,0.02); } } tk++; }catch(e){} }, 8500));
        h.iv(setInterval(function(){ try{ rise(ctx,bed.lp,330,494,ctx.currentTime,0.045,1.5); }catch(e){} }, 14000));
        return h; } },

    { id:'quiet', name:'Quiet Study', desc:'Barely-there hum with the occasional page turn. Very sparse.',
      build:function(ctx,out){ var h=mkHandle(), buf=noiseBuf(ctx);
        humBed(ctx,out,h,[[110,0.07],[165,0.035]],700,0.07,0.05,0.16);
        h.iv(setInterval(function(){ try{ tick(ctx,out,buf,2200,ctx.currentTime,0.014,0.04); }catch(e){} }, 5000));
        h.iv(setInterval(function(){ try{ paper(ctx,out,buf,1600,ctx.currentTime,0.03,0.7); }catch(e){} }, 11000));
        return h; } },

    { id:'desk', name:'Data Desk', desc:'A low hum under a soft, steady patter of keys.',
      build:function(ctx,out){ var h=mkHandle(), buf=noiseBuf(ctx);
        humBed(ctx,out,h,[[98,0.08],[147,0.04]],850,0.08,0.07,0.12);
        var c=0; h.iv(setInterval(function(){ try{ var t=ctx.currentTime, n=2+(c%4); for(var k=0;k<n;k++){ tick(ctx,out,buf,2800+((k*137)%700),t+k*0.075,0.016,0.02); } c++; }catch(e){} }, 3000));
        return h; } },

    { id:'terminal', name:'Warm Terminal', desc:'A warm hum with soft data blips drifting over it.',
      build:function(ctx,out){ var h=mkHandle(), buf=noiseBuf(ctx);
        humBed(ctx,out,h,[[110,0.08],[165,0.04]],1000,0.08,0.07,0.13);
        var seq=[660,880,990,784], i=0; h.iv(setInterval(function(){ try{ blip(ctx,out,seq[i++%seq.length],ctx.currentTime,0.04,0.5); }catch(e){} }, 2500));
        h.iv(setInterval(function(){ try{ tick(ctx,out,buf,3000,ctx.currentTime,0.014,0.02); }catch(e){} }, 1700));
        return h; } },

    { id:'focus', name:'Focus Room', desc:'A soft pad with a slow filter breath. Almost still.',
      build:function(ctx,out){ var h=mkHandle(), buf=noiseBuf(ctx);
        var lp=BQ(ctx,'lowpass',700,1); lp.connect(out);
        var sweep=O(ctx,'sine',0.04), sg=G(ctx,320); sweep.connect(sg); sg.connect(lp.frequency); sweep.start(); h.add(sweep);
        var amp=G(ctx,0.07); amp.connect(lp); breath(ctx,amp.gain,0.05,0.2,h);
        [[110,0.09],[165,0.05],[220,0.03]].forEach(function(d){ var o=O(ctx,'triangle',d[0]),g=G(ctx,d[1]); o.connect(g); g.connect(amp); o.start(); h.add(o); });
        h.iv(setInterval(function(){ try{ tick(ctx,out,buf,2000,ctx.currentTime,0.012,0.04); }catch(e){} }, 9000));
        return h; } },

    { id:'ledger', name:'Ledger', desc:'A quiet hum with pen-scratch texture and a soft tick of time.',
      build:function(ctx,out){ var h=mkHandle(), buf=noiseBuf(ctx);
        humBed(ctx,out,h,[[98,0.07],[147,0.035]],800,0.07,0.06,0.12);
        h.iv(setInterval(function(){ try{ tick(ctx,out,buf,2400,ctx.currentTime,0.016,0.03); }catch(e){} }, 2000));
        h.iv(setInterval(function(){ try{ var t=ctx.currentTime; for(var k=0;k<3;k++){ paper(ctx,out,buf,2600,t+k*0.14,0.02,0.16); } }catch(e){} }, 6000));
        return h; } },

    { id:'signal', name:'Signal Lab', desc:'A warm bed with a soft ping every few seconds and a faint rise.',
      build:function(ctx,out){ var h=mkHandle(), buf=noiseBuf(ctx);
        var bed=humBed(ctx,out,h,[[110,0.08],[165,0.04]],1000,0.08,0.09,0.14);
        h.iv(setInterval(function(){ try{ var t=ctx.currentTime, o=O(ctx,'sine',880), g=G(ctx,0.0001); o.frequency.setValueAtTime(880,t); o.frequency.exponentialRampToValueAtTime(560,t+0.4); o.connect(g); g.connect(bed.lp); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.05,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+1.0); o.start(t); o.stop(t+1.1); }catch(e){} }, 4000));
        h.iv(setInterval(function(){ try{ rise(ctx,bed.lp,392,588,ctx.currentTime,0.04,1.4); }catch(e){} }, 16000));
        return h; } },

    { id:'office', name:'Morning Office', desc:'A warm pad and light keyboard clatter in the distance.',
      build:function(ctx,out){ var h=mkHandle(), buf=noiseBuf(ctx);
        humBed(ctx,out,h,[[110,0.06],[165,0.035],[220,0.02]],900,0.07,0.07,0.14);
        var c=0; h.iv(setInterval(function(){ try{ var t=ctx.currentTime, n=3+(c%4); for(var k=0;k<n;k++){ tick(ctx,out,buf,2700+((k*97)%600),t+k*0.07,0.013,0.02); } c++; }catch(e){} }, 5000));
        h.iv(setInterval(function(){ try{ tick(ctx,out,buf,2200,ctx.currentTime,0.012,0.03); }catch(e){} }, 3000));
        return h; } },

    { id:'deepwork', name:'Deep Work', desc:'A deeper warm drone with a slow, gentle swell. Immersive.',
      build:function(ctx,out){ var h=mkHandle(), buf=noiseBuf(ctx);
        humBed(ctx,out,h,[[92,0.10],[138,0.05]],600,0.09,0.05,0.3);
        h.iv(setInterval(function(){ try{ tick(ctx,out,buf,1600,ctx.currentTime,0.014,0.05); }catch(e){} }, 7000));
        return h; } },

    { id:'calc', name:'Calc', desc:'A soft hum with a light adding-machine tick and a periodic two-note lift.',
      build:function(ctx,out){ var h=mkHandle(), buf=noiseBuf(ctx);
        humBed(ctx,out,h,[[110,0.07],[147,0.035]],850,0.07,0.07,0.12);
        var c=0; h.iv(setInterval(function(){ try{ if(c%3!==2){ tick(ctx,out,buf,2900,ctx.currentTime,0.013,0.02); } c++; }catch(e){} }, 900));
        h.iv(setInterval(function(){ try{ var t=ctx.currentTime; blip(ctx,out,660,t,0.035,0.5); blip(ctx,out,880,t+0.16,0.03,0.6); }catch(e){} }, 15000));
        return h; } },

    { id:'off', name:'Off (silent)', desc:'No sound during the build.',
      build:function(){ return mkHandle(); } }
  ];

  // Real-audio tracks appear first in the picker, ahead of the synth options.
  SOUNDS = FILE_SOUNDS.concat(SOUNDS);
  // Clean two-note finish chime — played once when a BOV or Marketing Pack is done.
  function finish(ctx,out){ try{ var t=ctx.currentTime;
    function n(freq,at,dur,peak){ var o=O(ctx,'sine',freq), o2=O(ctx,'triangle',freq*2), g=G(ctx,0.0001); o.connect(g); o2.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001,t+at); g.gain.exponentialRampToValueAtTime(peak,t+at+0.015); g.gain.exponentialRampToValueAtTime(0.0001,t+at+dur);
      o.start(t+at); o.stop(t+at+dur+0.05); o2.start(t+at); o2.stop(t+at+dur+0.05); }
    n(659.25, 0.00, 1.3, 0.30);   // E5
    n(987.77, 0.17, 1.7, 0.24);   // B5 — a clean rising two-note
  }catch(e){} }

  window.RRG_AMBIENCE = {
    sounds: SOUNDS,
    get:function(id){ for(var i=0;i<SOUNDS.length;i++){ if(SOUNDS[i].id===id) return SOUNDS[i]; } return SOUNDS[0]; },
    play:function(ctx,out,id){ return this.get(id).build(ctx,out); },
    finish:function(ctx,out){ return finish(ctx,out); }
  };
})();
