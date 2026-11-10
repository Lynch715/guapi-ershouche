/* 配对种子比较议价策略，报告离场率/轮次/仍可成交的报价，不把留库车当成亏光。 */
const fs = require('node:fs'), path = require('node:path');
for (const f of ['data','util','car','game','staff','finance','events']) require(path.join(__dirname,'..','js',f+'.js'));
const G = globalThis.G, count = Number(process.argv[2]) || 2000;
const report = { samplesPerPolicy:count, seeds:[1000,999+count], buy:{}, sell:{} };
const tactics = { g:'gentle', f:'firm', h:'hard' };
for (const side of ['buy','sell']) for (const policy of ['ggg','fff','hhh','fgg','hgg']) {
  let left=0, one=0, multiple=0, rounds=0, quoted=0, ratio=0;
  for (let seed=1000; seed<1000+count; seed++) {
    G.newGame('small','suburb',seed);
    let record, anchor, survived;
    if (side === 'buy') {
      G.act.visit('private'); const o=G.state.visit.offers[0]; anchor=G.offerPrice(o);
      for (const k of policy) {
        const index=G.state.visit.offers.indexOf(o); if(index<0)break;
        G.act.bargainOffer(index,tactics[k]);
        const last=o.negotiation.history?.slice(-1)[0];
        if(last && last.ask===last.quote)break; // 对方答应自己出的价就成交，和零售侧保持一致。
      }
      record=o.negotiation; survived=G.state.visit.offers.includes(o); quoted=G.offerPrice(o);
    } else {
      const car=G.Car.generate('dealer4s',{hiddenRate:0}); car.flaws=[]; G.Car.reveal(car); G.addCar(car,30000,'audit');
      G.act.meetBuyer(car.id); record=car.buyer; anchor=record.anchor;
      for(const k of policy) { if(record.status!=='talking')break; G.act.counterBuyer(car.id,tactics[k]); }
      survived=record.status!=='left'; quoted=record.quote;
    }
    rounds+=record.rounds; if(record.rounds===1)one++; if(record.rounds>1)multiple++;
    if(!survived)left++; else ratio+=quoted/anchor;
    if(seed<1020)G.parseSave(JSON.stringify(G.state));
  }
  report[side][policy]={ departureRate:left/count, oneRoundRate:one/count, multipleRoundRate:multiple/count, averageRounds:rounds/count, survivingQuoteToListing:ratio/(count-left)||null };
}
const output=JSON.stringify(report,null,2);
if(process.argv[3])fs.writeFileSync(path.resolve(process.argv[3]),output+'\n');
console.log(output);
