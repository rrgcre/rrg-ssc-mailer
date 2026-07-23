/* RRG build-ambience library. Ten selectable sounds plus "off".
   Each sound.build(ctx, out) creates nodes on the provided GainNode `out`
   (the caller owns master volume + fade) and returns a handle with stop().
   Kept deliberately light — pure sines/triangles, gentle envelopes, no heavy
   feedback — so nothing glitches into noise on any machine. */
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
  // one-shot note that swells and fades, then stops itself
  function note(ctx,dest,type,freq,t,peak,att,dur){
    var o=O(ctx,type,freq), g=ctx.createGain(); o.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+att); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.start(t); o.stop(t+dur+0.05);
  }
  // gentle tremolo LFO onto a gain param
  function breath(ctx,param,rate,depth,h){ var l=O(ctx,'sine',rate), lg=ctx.createGain(); lg.gain.value=depth; l.connect(lg); lg.connect(param); l.start(); h.add(l); }

  var SOUNDS=[
    { id:'orb', name:'Orb', desc:'Warm breathing sine chord — calm and round.',
      build:function(ctx,out){ var h=mkHandle();
        var lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1100; lp.connect(out);
        var amp=ctx.createGain(); amp.gain.value=0.85; amp.connect(lp);
        breath(ctx,amp.gain,0.07,0.16,h);
        [[220,0.13],[329.63,0.09],[440,0.03]].forEach(function(d){ var o=O(ctx,'sine',d[0]),g=ctx.createGain(); g.gain.value=d[1]; o.connect(g); g.connect(amp); o.start(); h.add(o); });
        return h; } },

    { id:'pad', name:'Deep Pad', desc:'Soft minor chord that gently swells.',
      build:function(ctx,out){ var h=mkHandle();
        var lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=850; lp.connect(out);
        var amp=ctx.createGain(); amp.gain.value=0.8; amp.connect(lp);
        breath(ctx,amp.gain,0.05,0.18,h);
        [[220,0.11],[261.63,0.08],[329.63,0.06]].forEach(function(d){ var o=O(ctx,'sine',d[0]),g=ctx.createGain(); g.gain.value=d[1]; o.connect(g); g.connect(amp); o.start(); h.add(o); });
        return h; } },

    { id:'shimmer', name:'Shimmer', desc:'A low bed with soft high notes drifting over it.',
      build:function(ctx,out){ var h=mkHandle();
        var lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=2600; lp.connect(out);
        var d=O(ctx,'sine',220), dg=ctx.createGain(); dg.gain.value=0.06; d.connect(dg); dg.connect(lp); d.start(); h.add(d);
        var seq=[880,1108.73,1318.51,987.77], i=0;
        h.iv(setInterval(function(){ try{ note(ctx,lp,'sine',seq[i++%seq.length],ctx.currentTime,0.05,0.03,1.4); }catch(e){} }, 1700));
        return h; } },

    { id:'sonar', name:'Sonar', desc:'A soft descending ping over a quiet bed.',
      build:function(ctx,out){ var h=mkHandle();
        var lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1600; lp.connect(out);
        var bed=O(ctx,'sine',110), bg=ctx.createGain(); bg.gain.value=0.05; bed.connect(bg); bg.connect(lp); bed.start(); h.add(bed);
        h.iv(setInterval(function(){ try{ var t=ctx.currentTime, o=O(ctx,'sine',880), g=ctx.createGain(); o.frequency.setValueAtTime(880,t); o.frequency.exponentialRampToValueAtTime(440,t+0.45); o.connect(g); g.connect(lp); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.08,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+1.3); o.start(t); o.stop(t+1.4); }catch(e){} }, 4000));
        return h; } },

    { id:'reactor', name:'Reactor', desc:'A warm fifth with a slow steady throb.',
      build:function(ctx,out){ var h=mkHandle();
        var lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1000; lp.connect(out);
        var amp=ctx.createGain(); amp.gain.value=0.7; amp.connect(lp);
        breath(ctx,amp.gain,1.2,0.3,h);
        [[220,0.11],[329.63,0.07]].forEach(function(d){ var o=O(ctx,'sine',d[0]),g=ctx.createGain(); g.gain.value=d[1]; o.connect(g); g.connect(amp); o.start(); h.add(o); });
        return h; } },

    { id:'crystal', name:'Crystal', desc:'Bell-like tones that ring and fade.',
      build:function(ctx,out){ var h=mkHandle();
        var seq=[523.25,659.25,783.99,987.77], i=0;
        h.iv(setInterval(function(){ try{ var f=seq[i++%seq.length], t=ctx.currentTime; note(ctx,out,'triangle',f,t,0.11,0.006,2.4); note(ctx,out,'sine',f*2,t,0.03,0.006,1.6); }catch(e){} }, 3500));
        return h; } },

    { id:'aurora', name:'Aurora', desc:'A soft chord under a slow filter sweep.',
      build:function(ctx,out){ var h=mkHandle();
        var lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=900; lp.Q.value=1; lp.connect(out);
        var l=O(ctx,'sine',0.04), lg=ctx.createGain(); lg.gain.value=520; l.connect(lg); lg.connect(lp.frequency); l.start(); h.add(l);
        [[220,0.09],[329.63,0.06]].forEach(function(d){ var o=O(ctx,'triangle',d[0]),g=ctx.createGain(); g.gain.value=d[1]; o.connect(g); g.connect(lp); o.start(); h.add(o); });
        return h; } },

    { id:'zen', name:'Zen Bowl', desc:'A singing bowl, struck now and then. Very sparse.',
      build:function(ctx,out){ var h=mkHandle();
        function strike(){ try{ var t=ctx.currentTime; note(ctx,out,'sine',174.61,t,0.14,0.01,5.5); note(ctx,out,'triangle',261.63,t,0.05,0.01,4); note(ctx,out,'sine',349.23,t,0.03,0.01,3); }catch(e){} }
        strike(); h.iv(setInterval(strike, 8000));
        return h; } },

    { id:'nebula', name:'Nebula', desc:'An evolving cloud of tones that drift in and out.',
      build:function(ctx,out){ var h=mkHandle();
        var lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1300; lp.connect(out);
        var voices=[[220,0.05,0.045],[277.18,0.05,0.06],[329.63,0.045,0.053],[415.30,0.04,0.038]];
        voices.forEach(function(v){ var o=O(ctx,'sine',v[0]), g=ctx.createGain(); g.gain.value=v[1]; o.connect(g); g.connect(lp); o.start(); h.add(o);
          var l=O(ctx,'sine',v[2]), lg=ctx.createGain(); lg.gain.value=v[1]*0.9; l.connect(lg); lg.connect(g.gain); l.start(); h.add(l); });
        return h; } },

    { id:'warp', name:'Warp Idle', desc:'A gently gliding sci-fi engine idle.',
      build:function(ctx,out){ var h=mkHandle();
        var lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1000; lp.connect(out);
        var amp=ctx.createGain(); amp.gain.value=0.8; amp.connect(lp); breath(ctx,amp.gain,0.09,0.14,h);
        var base=O(ctx,'triangle',200), bg=ctx.createGain(); bg.gain.value=0.1; base.connect(bg); bg.connect(amp); base.start(); h.add(base);
        var glide=O(ctx,'sine',0.06), gg=ctx.createGain(); gg.gain.value=28; glide.connect(gg); gg.connect(base.frequency); glide.start(); h.add(glide);
        var fifth=O(ctx,'triangle',300), fg=ctx.createGain(); fg.gain.value=0.05; fifth.connect(fg); fg.connect(amp); fifth.start(); h.add(fifth);
        var glide2=O(ctx,'sine',0.06), gg2=ctx.createGain(); gg2.gain.value=42; glide2.connect(gg2); gg2.connect(fifth.frequency); glide2.start(); h.add(glide2);
        return h; } },

    { id:'off', name:'Off (silent)', desc:'No sound during the build.',
      build:function(){ return mkHandle(); } }
  ];

  window.RRG_AMBIENCE = {
    sounds: SOUNDS,
    get:function(id){ for(var i=0;i<SOUNDS.length;i++){ if(SOUNDS[i].id===id) return SOUNDS[i]; } return SOUNDS[0]; },
    play:function(ctx,out,id){ return this.get(id).build(ctx,out); }
  };
})();
