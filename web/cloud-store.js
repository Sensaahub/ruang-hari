// One versioned board per account. Compare-and-swap prevents one device from
// silently replacing edits made on another device. Unsent snapshots are durable.
const clone=value=>structuredClone(value);
export class CloudStore {
  constructor({transport,storage,validate,onData=()=>{},onState=()=>{},newId=()=>crypto.randomUUID()}){
    Object.assign(this,{transport,storage,validate,onData,onState,newId});
    this.epoch=0;this.user=null;this.record=null;this.remote=null;this.phase='local';this.busy=false;this.ready=false;this.error='';
  }
  get key(){return `ruang-hari-cloud-v2:${this.user.id}`;}
  get locked(){return !!this.user&&(!this.ready||['loading','conflict','error'].includes(this.phase));}
  get tasks(){return clone(this.record?.tasks||[]);}
  emit(){this.onState({user:this.user,phase:this.phase,locked:this.locked,pending:!!this.record?.pending,error:this.error});}
  isValid(tasks){return Array.isArray(tasks)&&tasks.length<=10000&&tasks.every(this.validate)&&new Set(tasks.map(t=>t.id)).size===tasks.length;}
  persist(next){this.storage.setItem(this.key,JSON.stringify(next));this.record=next;}
  fail(error,hard=false){this.error=error?.message||'Koneksi belum tersedia.';this.phase=hard?'error':'offline';this.emit();}
  async connect(user){
    const epoch=++this.epoch;this.user=user;this.record=null;this.remote=null;this.busy=false;this.ready=false;this.error='';
    if(!user){this.phase='local';this.onData(null);this.emit();return;}
    this.phase='loading';this.onData([]);this.emit();
    try{
      const raw=this.storage.getItem(this.key);
      if(raw){const r=JSON.parse(raw);if(!this.isValid(r.tasks)||!Number.isSafeInteger(r.revision)||r.revision<0||!Number.isSafeInteger(r.seq)||r.seq<0||typeof r.pending!=='boolean'||(r.flight&&(!this.isValid(r.flight.tasks)||!Number.isSafeInteger(r.flight.revision)||r.flight.revision<0||!Number.isSafeInteger(r.flight.seq)||typeof r.flight.id!=='string')))throw Error('Cache akun tidak dapat dibaca. Unduh cadangan sebelum memulihkan.');this.record=r;this.ready=true;this.onData(this.tasks);}
      else this.record={tasks:[],revision:0,seq:0,pending:false,flight:null};
    }catch(error){this.fail(error,true);return;}
    await this.refresh(epoch);
  }
  save(tasks){
    if(!this.user||this.locked)throw Error('Sinkronisasi belum siap. Tunggu atau selesaikan konflik terlebih dulu.');
    if(!this.isValid(tasks))throw Error('Data tugas tidak valid.');
    const next={...this.record,tasks:clone(tasks),seq:this.record.seq+1,pending:true};
    // Persist before accepting an edit: a quota error must not lose pending work.
    this.persist(next);this.phase='pending';this.emit();void this.flush();
  }
  async refresh(epoch=this.epoch){
    if(!this.user||epoch!==this.epoch||this.busy)return;
    const user=this.user;
    try{
      const remote=await this.transport.read(user);
      if(epoch!==this.epoch)return;
      if(!this.isValid(remote.tasks)||!Number.isSafeInteger(remote.revision)||remote.revision<0)throw Error('Data server tidak valid.');
      // A refresh begun before a successful write can arrive late.
      if(remote.revision<this.record.revision)return;
      this.ready=true;
      if(this.record.pending){
        if(this.record.flight&&remote.mutation_id===this.record.flight.id){this.ack(remote);}
        else if(remote.revision!==this.record.revision){this.remote=clone(remote);this.phase='conflict';this.emit();return;}
        else{this.phase='pending';this.emit();}
      }else{
        if(remote.revision>=this.record.revision){this.persist({...this.record,tasks:clone(remote.tasks),revision:remote.revision,flight:null,pending:false});this.onData(this.tasks);}
        this.phase='synced';this.error='';this.emit();
      }
      if(this.record.pending)void this.flush();
    }catch(error){if(epoch===this.epoch)this.fail(error,!this.ready);}
  }
  ack(remote){
    const same=this.record.seq===this.record.flight.seq;
    const next={...this.record,revision:remote.revision,flight:null,pending:!same,...(same?{tasks:clone(remote.tasks)}:{})};
    this.persist(next);this.phase=same?'synced':'pending';this.error='';
    if(same)this.onData(this.tasks);this.emit();
  }
  async flush(){
    if(!this.user||this.busy||this.locked||!this.record?.pending)return;
    const epoch=this.epoch,user=this.user;this.busy=true;
    try{
      if(!this.record.flight)this.persist({...this.record,flight:{id:this.newId(),revision:this.record.revision,tasks:this.tasks,seq:this.record.seq}});
      const remote=await this.transport.write(user,clone(this.record.flight));
      if(epoch!==this.epoch)return;
      if(!this.isValid(remote.tasks)||!Number.isSafeInteger(remote.revision)||remote.mutation_id!==this.record.flight.id)throw Error('Balasan sinkronisasi tidak valid.');
      this.ack(remote);
    }catch(error){
      if(epoch!==this.epoch)return;
      if(error.code==='40001'){
        this.busy=false;await this.refresh(epoch);return;
      }
      this.fail(error);
    }finally{
      if(epoch===this.epoch){this.busy=false;if(this.phase==='pending')void this.flush();}
    }
  }
  resolve(choice){
    if(this.phase!=='conflict'||!this.remote)return;
    if(choice==='remote'){
      this.persist({...this.record,tasks:clone(this.remote.tasks),revision:this.remote.revision,pending:false,flight:null});
      this.phase='synced';this.remote=null;this.onData(this.tasks);this.emit();
    }else if(choice==='local'){
      this.persist({...this.record,revision:this.remote.revision,seq:this.record.seq+1,pending:true,flight:null});
      this.phase='pending';this.remote=null;this.emit();void this.flush();
    }
  }
}
