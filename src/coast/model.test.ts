import {describe,expect,it} from 'vitest';
import {ANCHORS,COIN_PER_FISH,MAX_COAST_COUNT,PROJECTS,activityDuration,advanceCoast,canStartActivity,initialCoast,isWork,migrateCoastV8,migrateCoastV9,parseCoast,projectCost,sampleCoast,sellFish,setWorkInterval,startActivity,stopWork,workYield,type CoastalAction,type CoastalState} from './model';

const finish=(state:CoastalState,action:CoastalAction)=>stopWork(advanceCoast(startActivity(state,action),activityDuration(action,state.workInterval)));
const funded=():CoastalState=>({...initialCoast(),catches:20,fish:20,totalGathered:100,wood:100,coins:500});

describe('durable coastal resources and activities',()=>{
  it('starts with strict independent durable progress and one active trip',()=>{
    const state=initialCoast();expect(state).toEqual({activity:null,elapsedMs:0,catches:0,totalGathered:0,fish:0,wood:0,coins:0,decoration:0,houseLevel:1,workInterval:10,lastReport:null,workTimeMs:0,workAmount:0});
    const started=startActivity(state,'fish');expect(started).toMatchObject({activity:'fish',elapsedMs:0});expect(startActivity(started,'gather')).toBe(started);expect(state.activity).toBeNull();expect(initialCoast()).not.toBe(state);
  });
  it('waits ten minutes for a reward and keeps working on subsequent cycles',()=>{
    const started=startActivity(initialCoast(),'fish');const partial=advanceCoast(started,1500);expect(partial).toMatchObject({activity:'fish',elapsedMs:1500,fish:0,catches:0});
    const restored=parseCoast(JSON.parse(JSON.stringify(partial)));const almost=advanceCoast(restored,598499);expect(almost.activity).toBe('fish');expect(almost.fish).toBe(0);expect(almost.lastReport).toBeNull();
    const done=advanceCoast(almost,1);expect(done).toMatchObject({activity:'fish',elapsedMs:0,fish:2,catches:2,lastReport:{id:1,activity:'fish',amount:2,cycles:1}});
    expect(advanceCoast(done,600001)).toMatchObject({activity:'fish',elapsedMs:1,fish:4,catches:4,lastReport:{id:2,activity:'fish',amount:2,cycles:1}});expect(started.fish).toBe(0);
  });
  it('connects fish sales and wood gathering to a crafted flowerpot',()=>{
    let state=initialCoast();for(let i=0;i<2;i++){state=finish(state,'fish');state=finish(state,'gather');}
    expect(state).toMatchObject({fish:4,catches:4,wood:4,totalGathered:4});state=sellFish(state);expect(COIN_PER_FISH).toBe(15);expect(state).toMatchObject({fish:0,catches:4,coins:60});
    const project=startActivity(state,'flower');expect(project).toMatchObject({activity:'flower',wood:1,coins:40,decoration:0});const almost=advanceCoast(project,4199);expect(almost.decoration).toBe(0);const done=advanceCoast(almost,1);expect(done).toMatchObject({decoration:1,wood:1,coins:40});expect(startActivity(done,'flower')).toBe(done);
  });
  it('reserves project costs once and restores a pending build without charging again',()=>{
    const ready={...initialCoast(),totalGathered:3,wood:3,coins:20};const started=startActivity(ready,'flower');expect(started).toMatchObject({wood:0,coins:0,decoration:0});
    const pending=parseCoast(advanceCoast(started,2000));expect(pending.elapsedMs).toBe(2000);expect(advanceCoast(pending,2200)).toMatchObject({wood:0,coins:0,decoration:1,activity:null});
  });
  it('makes home expansion increase both resource yields and unlock projects',()=>{
    const state=funded();expect(canStartActivity(state,'lantern')).toBe(false);expect(canStartActivity(state,'bench')).toBe(false);expect(projectCost(state,'upgrade')).toEqual({wood:12,coins:75});
    const upgrade=startActivity(state,'upgrade');expect(upgrade).toMatchObject({wood:88,coins:425,houseLevel:1});let level2=advanceCoast(upgrade,4200);expect(level2.houseLevel).toBe(2);expect(projectCost(level2,'upgrade')).toEqual({wood:25,coins:150});
    expect(finish(level2,'fish').fish-level2.fish).toBe(4);expect(finish(level2,'gather').wood-level2.wood).toBe(4);expect(canStartActivity(level2,'lantern')).toBe(true);
    level2=finish(level2,'lantern');expect(level2.decoration).toBe(2);const level3=finish(level2,'upgrade');expect(level3.houseLevel).toBe(3);expect(finish(level3,'fish').fish-level3.fish).toBe(6);expect(finish(level3,'gather').wood-level3.wood).toBe(6);expect(canStartActivity(level3,'bench')).toBe(true);expect(startActivity(level3,'upgrade')).toBe(level3);
  });
  it('supports independent decoration ownership while enforcing required home levels',()=>{
    const state={...funded(),houseLevel:3};const bench=finish(state,'bench');expect(bench.decoration).toBe(4);const all=finish(finish(bench,'flower'),'lantern');expect(all.decoration).toBe(7);for(const project of PROJECTS)expect(startActivity(all,project.action)).toBe(all);
    expect(PROJECTS.map(({name,bit,frame,requiredLevel,wood,coins})=>({name,bit,frame,requiredLevel,wood,coins}))).toEqual([{name:'꽃화분',bit:1,frame:5,requiredLevel:1,wood:3,coins:20},{name:'등불',bit:2,frame:6,requiredLevel:2,wood:6,coins:45},{name:'벤치',bit:4,frame:7,requiredLevel:3,wood:12,coins:90}]);
  });
  it('rejects unavailable transactions and keeps sale atomic at the coin cap',()=>{
    const state=initialCoast();for(const action of ['flower','lantern','bench','upgrade'] as const)expect(startActivity(state,action)).toBe(state);expect(sellFish(state)).toBe(state);
    const active=advanceCoast(startActivity(funded(),'gather'),2000);expect(sellFish(active)).toMatchObject({activity:'gather',elapsedMs:2000,fish:0,catches:20,coins:800});const tooMuch={...funded(),coins:1_000_000_000_000};expect(sellFish(tooMuch)).toBe(tooMuch);const boundary={...funded(),fish:1,coins:1_000_000_000_000-15};expect(sellFish(boundary)).toMatchObject({fish:0,coins:1_000_000_000_000});
  });
  it('samples the saved elapsed time through the existing path and action frames',()=>{
    const active=startActivity(initialCoast(),'fish');expect(sampleCoast(active)).toMatchObject({...ANCHORS.home,pose:'walk',phase:'outbound',frame:0,progress:0});expect(sampleCoast(advanceCoast(active,600))).toMatchObject({x:48,y:56,phase:'outbound'});
    expect(sampleCoast(advanceCoast(active,1200))).toMatchObject({...ANCHORS.dock,pose:'fish',phase:'working',frame:4});expect(sampleCoast(advanceCoast(active,300000))).toMatchObject({...ANCHORS.dock,pose:'fish',phase:'working'});expect(sampleCoast(advanceCoast(active,599400))).toMatchObject({x:48,y:56,phase:'inbound'});
    expect([4,5]).toContain(sampleCoast(advanceCoast(active,1400)).frame);expect([4,5]).toContain(sampleCoast(advanceCoast(active,2600)).frame);
    expect(sampleCoast(startActivity(funded(),'flower'))).toMatchObject({...ANCHORS.home,pose:'walk'});expect(sampleCoast(advanceCoast(startActivity(funded(),'upgrade'),1200))).toMatchObject({...ANCHORS.house,pose:'decorate',frame:12});
  });
  it('strictly rejects missing unknown fractional unowned and inconsistent records',()=>{
    const state=initialCoast();const {fish:ignored,...missing}=state;void ignored;
    const invalid=[missing,{...state,extra:true},{...state,elapsedMs:1},{...state,fish:1},{...state,wood:1},{...state,houseLevel:0},{...state,houseLevel:4},{...state,decoration:2},{...state,decoration:8},{...state,coins:0.5},{...state,catches:NaN},{...state,coins:1_000_000_000_001},{...state,activity:'decorate'},{...state,activity:'fish',elapsedMs:600000},{...state,activity:'gather',workInterval:15,elapsedMs:900000},{...state,activity:'upgrade',houseLevel:3},{...state,activity:'flower',decoration:1},{...state,workInterval:5},{...state,workInterval:'10'},{...state,lastReport:undefined}];
    for(const value of invalid)expect(()=>parseCoast(value)).toThrow(/[가-힣]/);expect(parseCoast(state)).toEqual(state);
  });
  it('guards invalid deltas and maximum-resource pending rewards without losing resources',()=>{
    const active=startActivity(initialCoast(),'fish');for(const delta of [NaN,Infinity,-1,0.5])expect(advanceCoast(active,delta)).toBe(active);expect(advanceCoast(active,0)).toBe(active);
    const full={...initialCoast(),catches:1_000_000_000_000,fish:1_000_000_000_000,totalGathered:1_000_000_000_000,wood:1_000_000_000_000};expect(startActivity(full,'fish')).toBe(full);expect(startActivity(full,'gather')).toBe(full);expect(()=>parseCoast({...full,activity:'fish'})).toThrow();expect(()=>parseCoast({...full,activity:'gather'})).toThrow();
    const invalid={...initialCoast(),wood:Infinity};expect(startActivity(invalid,'fish')).toBe(invalid);expect(advanceCoast(invalid,10000)).toBe(invalid);expect(sellFish(invalid)).toBe(invalid);
  });

  it.each([{houseLevel:1,amount:3},{houseLevel:2,amount:6},{houseLevel:3,amount:9}])('pays a proportional fifteen-minute yield at home level $houseLevel',({houseLevel,amount})=>{
    const ready=setWorkInterval({...initialCoast(),houseLevel},15);expect(workYield(ready)).toBe(amount);expect(workYield({...ready,workInterval:10})).toBe(houseLevel*2);
    const active=startActivity(ready,'gather');expect(advanceCoast(active,899999)).toMatchObject({wood:0,lastReport:null});
    expect(advanceCoast(active,900000)).toMatchObject({activity:'gather',wood:amount,totalGathered:amount,lastReport:{id:1,activity:'gather',amount,cycles:1}});
  });

  it('aggregates delayed cycles in one report while preserving the remaining cycle time',()=>{
    const active=advanceCoast(startActivity(initialCoast(),'fish'),1234);
    const delayed=advanceCoast(active,1800432);expect(delayed).toMatchObject({activity:'fish',elapsedMs:1666,fish:6,catches:6,lastReport:{id:1,activity:'fish',amount:6,cycles:3}});
    expect(advanceCoast(delayed,600000)).toMatchObject({elapsedMs:1666,fish:8,lastReport:{id:2,activity:'fish',amount:2,cycles:1}});
    const large=advanceCoast(active,Number.MAX_SAFE_INTEGER);expect(large.lastReport).toMatchObject({activity:'fish',amount:30_023_997_514,cycles:15_011_998_757});expect(large.elapsedMs).toBe(542225);expect(()=>parseCoast(large)).not.toThrow();
  });

  it('stops before the next full reward would exceed either resource cap',()=>{
    const near={...initialCoast(),catches:MAX_COAST_COUNT-5,fish:MAX_COAST_COUNT-7};
    const result=advanceCoast(startActivity(near,'fish'),1800000);expect(result).toMatchObject({activity:null,elapsedMs:0,catches:MAX_COAST_COUNT-1,fish:MAX_COAST_COUNT-3,lastReport:{amount:4,cycles:2}});expect(startActivity(result,'fish')).toBe(result);expect(advanceCoast(result,Number.MAX_SAFE_INTEGER)).toBe(result);
    const last=advanceCoast(startActivity({...initialCoast(),totalGathered:MAX_COAST_COUNT-2,wood:MAX_COAST_COUNT-2},'gather'),600000);expect(last).toMatchObject({activity:null,elapsedMs:0,totalGathered:MAX_COAST_COUNT,wood:MAX_COAST_COUNT});expect(()=>parseCoast(last)).not.toThrow();
    const notEnough={...initialCoast(),catches:MAX_COAST_COUNT-1};expect(startActivity(notEnough,'fish')).toBe(notEnough);expect(()=>parseCoast({...notEnough,activity:'fish'})).toThrow();
  });

  it('stops explicitly without losing collected resources and changes intervals only while idle',()=>{
    const active=advanceCoast(startActivity(funded(),'fish'),612345);expect(setWorkInterval(active,15)).toBe(active);expect(startActivity(active,'flower')).toBe(active);expect(startActivity(active,'upgrade')).toBe(active);
    const stopped=stopWork(active);expect(stopped).toMatchObject({activity:null,elapsedMs:0,fish:22,wood:100,coins:500,lastReport:{id:1,amount:2}});expect(stopWork(stopped)).toBe(stopped);
    const changed=setWorkInterval(stopped,15);expect(changed.workInterval).toBe(15);expect(changed.lastReport).toEqual(active.lastReport);expect(setWorkInterval(changed,15)).toBe(changed);expect(setWorkInterval(changed,12 as 10)).toBe(changed);
    const craft=startActivity(stopped,'flower');expect(stopWork(craft)).toBe(craft);expect(setWorkInterval(craft,15)).toBe(craft);expect(sellFish(craft)).toBe(craft);expect(isWork('fish')).toBe(true);expect(isWork('gather')).toBe(true);expect(isWork('flower')).toBe(false);expect(isWork(null)).toBe(false);
  });

  it('strictly validates reports and copies them independently across parsing',()=>{
    const state={...funded(),lastReport:{id:1,activity:'fish' as const,amount:4,cycles:2}};expect(parseCoast(state)).toEqual(state);const copy=parseCoast(state);copy.lastReport!.amount=6;expect(state.lastReport.amount).toBe(4);
    const report=state.lastReport;
    for(const lastReport of [{...report,id:0},{...report,id:MAX_COAST_COUNT+1},{...report,id:1.5},{...report,amount:3},{...report,amount:19},{...report,cycles:0},{...report,cycles:MAX_COAST_COUNT+1},{...report,cycles:.5},{...report,activity:'flower'},{...report,amount:21,cycles:3},{...report,extra:true},{id:1,activity:'fish',amount:4},[],false])expect(()=>parseCoast({...state,lastReport})).toThrow();
    const wrapped=advanceCoast(startActivity({...state,lastReport:{...report,id:MAX_COAST_COUNT}},'gather'),600000);expect(wrapped.lastReport).toEqual({id:1,activity:'gather',amount:2,cycles:1});
  });

  it('validates the exact legacy shape before adding idle defaults and preserves pending progress',()=>{
    const legacy={activity:'fish',elapsedMs:5199,catches:20,totalGathered:100,fish:2,wood:1,coins:85,decoration:3,houseLevel:2};
    expect(migrateCoastV8(legacy)).toEqual({...legacy,workInterval:10,lastReport:null,workTimeMs:5199,workAmount:0});expect(advanceCoast(migrateCoastV8(legacy),594801)).toMatchObject({activity:'fish',fish:6,catches:24,lastReport:{amount:4,cycles:1}});
    expect(migrateCoastV8({...legacy,activity:'gather',elapsedMs:4199})).toMatchObject({activity:'gather',elapsedMs:4199,wood:1});expect(migrateCoastV8({...legacy,activity:'upgrade',elapsedMs:4199})).toMatchObject({activity:'upgrade',elapsedMs:4199,houseLevel:2});
    for(const invalid of [{...legacy,elapsedMs:5200},{...legacy,activity:'gather',elapsedMs:4200},{...legacy,activity:'upgrade',elapsedMs:4200},{...legacy,workInterval:10},{...legacy,lastReport:null},{...legacy,activity:null,elapsedMs:1},{...legacy,catches:MAX_COAST_COUNT,fish:MAX_COAST_COUNT}])expect(()=>migrateCoastV8(invalid)).toThrow();
  });

  it('preserves full legacy resources while stopping work that cannot fit its new reward',()=>{
    const legacy={activity:'fish',elapsedMs:4999,catches:MAX_COAST_COUNT-1,totalGathered:3,fish:5,wood:3,coins:85,decoration:1,houseLevel:1};
    const migrated=migrateCoastV8(legacy);expect(migrated).toEqual({...legacy,activity:null,elapsedMs:0,workInterval:10,lastReport:null,workTimeMs:0,workAmount:0});expect(parseCoast(migrated)).toEqual(migrated);
    const gather=migrateCoastV8({...legacy,activity:'gather',elapsedMs:4199,totalGathered:MAX_COAST_COUNT-1});expect(gather).toMatchObject({activity:null,elapsedMs:0,wood:3,totalGathered:MAX_COAST_COUNT-1});
  });

  it('keeps the current work duration and earned amount across cycles, sales and parse roundtrips',()=>{
    const started=startActivity(funded(),'fish');expect(started).toMatchObject({workTimeMs:0,workAmount:0});
    const partial=advanceCoast(started,599999);expect(partial).toMatchObject({elapsedMs:599999,workTimeMs:599999,workAmount:0});
    const earned=advanceCoast(partial,600002);expect(earned).toMatchObject({elapsedMs:1,workTimeMs:1200001,workAmount:4,fish:24});
    const sold=sellFish(parseCoast(earned));expect(sold).toMatchObject({activity:'fish',workTimeMs:1200001,workAmount:4,fish:0,coins:860});
    const stopped=stopWork(sold);expect(stopped).toMatchObject({activity:null,elapsedMs:0,workTimeMs:0,workAmount:0,catches:24,coins:860});expect(startActivity(stopped,'gather')).toMatchObject({workTimeMs:0,workAmount:0});
    const craft=advanceCoast(startActivity(stopped,'flower'),2000);expect(craft).toMatchObject({activity:'flower',elapsedMs:2000,workTimeMs:0,workAmount:0});
    expect(advanceCoast(craft,2200)).toMatchObject({activity:null,workTimeMs:0,workAmount:0});
  });

  it('bounds cumulative work time without overflowing a delayed tick and resets work totals at the resource cap',()=>{
    const active={...startActivity(initialCoast(),'gather'),workTimeMs:MAX_COAST_COUNT-10};
    expect(advanceCoast(active,20)).toMatchObject({workTimeMs:MAX_COAST_COUNT,elapsedMs:20,workAmount:0});
    const delayed=advanceCoast(active,Number.MAX_SAFE_INTEGER);expect(delayed.workTimeMs).toBe(MAX_COAST_COUNT);expect(delayed.workAmount).toBe(30_023_997_514);expect(()=>parseCoast(delayed)).not.toThrow();
    const near=startActivity({...funded(),catches:MAX_COAST_COUNT-2},'fish');const stopped=advanceCoast(near,600000);expect(stopped).toMatchObject({activity:null,elapsedMs:0,workTimeMs:0,workAmount:0,catches:MAX_COAST_COUNT,lastReport:{amount:2}});
  });

  it('rejects missing or inconsistent current work totals while accepting statistics from an older started job',()=>{
    const active=advanceCoast(startActivity(funded(),'fish'),1000);
    const {workAmount:ignoredAmount,...missingAmount}=active;const {workTimeMs:ignoredTime,...missingTime}=active;void ignoredAmount;void ignoredTime;
    for(const state of [missingAmount,missingTime,{...active,workTimeMs:999},{...active,workTimeMs:-1},{...active,workTimeMs:.5},{...active,workTimeMs:MAX_COAST_COUNT+1},{...active,workAmount:-1},{...active,workAmount:.5},{...active,workAmount:MAX_COAST_COUNT+1},{...active,workAmount:21},{...initialCoast(),workTimeMs:1},{...funded(),workAmount:1},{...startActivity(funded(),'flower'),workTimeMs:1},{...startActivity(funded(),'flower'),workAmount:1}])expect(()=>parseCoast(state)).toThrow();
    expect(parseCoast({...active,workTimeMs:1000,workAmount:20})).toMatchObject({workAmount:20});
    expect(()=>parseCoast({...active,activity:'gather',workAmount:101})).toThrow();
  });

  it('migrates only exact v9 records, preserves reports and starts statistics at the current remainder',()=>{
    const {workTimeMs:ignoredTime,workAmount:ignoredAmount,...legacy}=initialCoast();void ignoredTime;void ignoredAmount;
    const working={...legacy,activity:'fish',elapsedMs:12345,catches:8,fish:2,lastReport:{id:4,activity:'fish',amount:4,cycles:1}};
    const migrated=migrateCoastV9(working);expect(migrated).toEqual({...working,workTimeMs:12345,workAmount:0});expect(parseCoast(migrated)).toEqual(migrated);
    migrated.lastReport!.amount=2;expect(working.lastReport.amount).toBe(4);
    expect(migrateCoastV9({...working,activity:null,elapsedMs:0})).toMatchObject({workTimeMs:0,workAmount:0});
    expect(migrateCoastV9({...working,activity:'flower',elapsedMs:1234})).toMatchObject({workTimeMs:0,workAmount:0});
    for(const invalid of [{...working,workTimeMs:12345},{...working,workAmount:0},{...working,elapsedMs:600000},{...working,lastReport:{...working.lastReport,amount:9}},{...working,catches:MAX_COAST_COUNT-1}])expect(()=>migrateCoastV9(invalid)).toThrow();
  });
});
