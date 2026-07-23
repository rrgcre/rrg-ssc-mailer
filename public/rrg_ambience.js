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
  // a short percussive tick (bandpassed noise) — conveyor / gear
  function tick(ctx,dest,buf,cf,t,peak,dur){
    var s=noise(ctx,buf), bp=BQ(ctx,'bandpass',cf,4), g=G(ctx,0.0001); s.connect(bp); bp.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+0.003); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    s.start(t); s.stop(t+dur+0.03);
  }

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
    { id:'factory', name:'Factory Floor', desc:'A low motor drone under a steady mechanical piston beat.',
      build:function(ctx,out){ var h=mkHandle(), buf=noiseBuf(ctx);
        var lp=BQ(ctx,'lowpass',620); lp.connect(out);
        var amp=G(ctx,0.09); amp.connect(lp); breath(ctx,amp.gain,0.4,0.12,h);
        [[110,0.09],[147,0.05]].forEach(function(d){ var o=O(ctx,'triangle',d[0]),g=G(ctx,d[1]); o.connect(g); g.connect(amp); o.start(); h.add(o); });
        var beat=0; h.iv(setInterval(function(){ try{ var t=ctx.currentTime; thud(ctx,out,138,t,0.12); if(beat%2===1) tick(ctx,out,buf,2400,t+0.45,0.03,0.05); beat++; }catch(e){} }, 900));
        return h; } },

    { id:'foundry', name:'Foundry', desc:'Metallic clanks ringing out over a furnace rumble.',
      build:function(ctx,out){ var h=mkHandle(), buf=noiseBuf(ctx);
        var lp=BQ(ctx,'lowpass',260); lp.connect(out);
        var rum=noise(ctx,buf), rg=G(ctx,0.04); rum.connect(lp); lp.connect(out); rum.connect(rg); rg.connect(lp); rum.start(); h.add(rum);
        var base=O(ctx,'triangle',92), bg=G(ctx,0.05); base.connect(bg); bg.connect(lp); base.start(); h.add(base); breath(ctx,bg.gain,0.3,0.5,h);
        var seq=[196,233,175,262], i=0;
        h.iv(setInterval(function(){ try{ clank(ctx,out,seq[i++%seq.length],ctx.currentTime,0.09,2.2); }catch(e){} }, 2100));
        return h; } },

    { id:'turbine', name:'Turbine', desc:'A smooth turbine whir that slowly rises and falls.',
      build:function(ctx,out){ var h=mkHandle();
        var lp=BQ(ctx,'lowpass',1400,2); lp.connect(out);
        var sweep=O(ctx,'sine',0.05), sg=G(ctx,700); sweep.connect(sg); sg.connect(lp.frequency); sweep.start(); h.add(sweep);
        var amp=G(ctx,0.07); amp.connect(lp); breath(ctx,amp.gain,0.12,0.2,h);
        [[174,0.05],[176.5,0.05],[352,0.03]].forEach(function(d){ var o=O(ctx,'sawtooth',d[0]),g=G(ctx,d[1]); o.connect(g); g.connect(amp); o.start(); h.add(o); });
        return h; } },

    { id:'steam', name:'Steam Works', desc:'A boiler hum with rhythmic bursts of steam.',
      build:function(ctx,out){ var h=mkHandle(), buf=noiseBuf(ctx);
        var lp=BQ(ctx,'lowpass',700); lp.connect(out);
        var boil=O(ctx,'triangle',120), bg=G(ctx,0.06); boil.connect(bg); bg.connect(lp); boil.start(); h.add(boil); breath(ctx,bg.gain,0.9,0.35,h);
        var alt=0; h.iv(setInterval(function(){ try{ var t=ctx.currentTime; hiss(ctx,out,buf,2600,t,(alt%2?0.05:0.07),0.12,(alt%2?0.7:1.3)); alt++; }catch(e){} }, 3400));
        return h; } },

    { id:'assembly', name:'Assembly Line', desc:'A conveyor tick with servo whirs stepping across it.',
      build:function(ctx,out){ var h=mkHandle(), buf=noiseBuf(ctx);
        var lp=BQ(ctx,'lowpass',900); lp.connect(out);
        var bed=O(ctx,'triangle',98), bg=G(ctx,0.05); bed.connect(bg); bg.connect(lp); bed.start(); h.add(bed);
        h.iv(setInterval(function(){ try{ tick(ctx,out,buf,3000,ctx.currentTime,0.035,0.04); }catch(e){} }, 520));
        h.iv(setInterval(function(){ try{ var t=ctx.currentTime, o=O(ctx,'sawtooth',300), lp2=BQ(ctx,'lowpass',1600), g=G(ctx,0.0001); o.connect(lp2); lp2.connect(g); g.connect(out); o.frequency.setValueAtTime(300,t); o.frequency.exponentialRampToValueAtTime(620,t+0.22); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.05,t+0.04); g.gain.exponentialRampToValueAtTime(0.0001,t+0.5); o.start(t); o.stop(t+0.55); }catch(e){} }, 2600));
        return h; } },

    { id:'hydraulic', name:'Hydraulic Press', desc:'A slow pneumatic press: a groan down, then a hiss of release.',
      build:function(ctx,out){ var h=mkHandle(), buf=noiseBuf(ctx);
        function cycle(){ try{ var t=ctx.currentTime;
          var o=O(ctx,'sawtooth',220), lp=BQ(ctx,'lowpass',900), g=G(ctx,0.0001); o.connect(lp); lp.connect(g); g.connect(out);
          o.frequency.setValueAtTime(220,t); o.frequency.exponentialRampToValueAtTime(96,t+1.1);
          g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.08,t+0.2); g.gain.setValueAtTime(0.08,t+1.0); g.gain.exponentialRampToValueAtTime(0.0001,t+1.25);
          o.start(t); o.stop(t+1.3);
          thud(ctx,out,120,t+1.05,0.1);
          hiss(ctx,out,buf,2200,t+1.15,0.06,0.05,0.8);
        }catch(e){} }
        cycle(); h.iv(setInterval(cycle, 4200));
        return h; } },

    { id:'generator', name:'Generator', desc:'A steady electrical hum with a slow flicker.',
      build:function(ctx,out){ var h=mkHandle();
        var lp=BQ(ctx,'lowpass',1200); lp.connect(out);
        var amp=G(ctx,0.07); amp.connect(lp); breath(ctx,amp.gain,0.7,0.12,h);
        [[120,'sawtooth',0.06],[240,'sawtooth',0.03],[360,'square',0.012]].forEach(function(d){ var o=O(ctx,d[1],d[0]),g=G(ctx,d[2]); o.connect(g); g.connect(amp); o.start(); h.add(o); });
        return h; } },

    { id:'forge', name:'Forge', desc:'Hammer strikes on the anvil, ringing out. Sparse and heavy.',
      build:function(ctx,out){ var h=mkHandle();
        function strike(){ try{ var t=ctx.currentTime; thud(ctx,out,150,t,0.09); clank(ctx,out,330,t+0.005,0.11,2.6); }catch(e){} }
        strike(); h.iv(setInterval(strike, 2200));
        return h; } },

    { id:'boiler', name:'Boiler Room', desc:'A deep pump throb with the odd pipe knock.',
      build:function(ctx,out){ var h=mkHandle();
        var lp=BQ(ctx,'lowpass',560); lp.connect(out);
        var amp=G(ctx,0.08); amp.connect(lp); breath(ctx,amp.gain,0.9,0.4,h);
        [[98,0.09],[147,0.05]].forEach(function(d){ var o=O(ctx,'triangle',d[0]),g=G(ctx,d[1]); o.connect(g); g.connect(amp); o.start(); h.add(o); });
        var k=0; h.iv(setInterval(function(){ try{ if(k%3===0) clank(ctx,out,262,ctx.currentTime,0.05,1.1); k++; }catch(e){} }, 2400));
        return h; } },

    { id:'machine', name:'Machine Idle', desc:'A steady machine idle with gear ticks.',
      build:function(ctx,out){ var h=mkHandle(), buf=noiseBuf(ctx);
        var lp=BQ(ctx,'lowpass',700); lp.connect(out);
        var mot=O(ctx,'triangle',104), mg=G(ctx,0.07); mot.connect(mg); mg.connect(lp); mot.start(); h.add(mot); breath(ctx,mg.gain,0.5,0.14,h);
        var rat=noise(ctx,buf), bp=BQ(ctx,'bandpass',480,2), rg=G(ctx,0.015); rat.connect(bp); bp.connect(rg); rg.connect(out); rat.start(); h.add(rat); breath(ctx,rg.gain,3.0,0.01,h);
        h.iv(setInterval(function(){ try{ tick(ctx,out,buf,1800,ctx.currentTime,0.03,0.03); }catch(e){} }, 700));
        return h; } },

    { id:'off', name:'Off (silent)', desc:'No sound during the build.',
      build:function(){ return mkHandle(); } }
  ];

  // Real-audio tracks appear first in the picker, ahead of the synth options.
  SOUNDS = FILE_SOUNDS.concat(SOUNDS);
  window.RRG_AMBIENCE = {
    sounds: SOUNDS,
    get:function(id){ for(var i=0;i<SOUNDS.length;i++){ if(SOUNDS[i].id===id) return SOUNDS[i]; } return SOUNDS[0]; },
    play:function(ctx,out,id){ return this.get(id).build(ctx,out); }
  };
})();
