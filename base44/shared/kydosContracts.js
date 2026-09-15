export const KYDOS_SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRouter {
  function factory() external view returns (address);
  function WETH() external view returns (address);
  function addLiquidityETH(address,uint,uint,uint,address,uint) external payable returns (uint,uint,uint);
}
interface IUniFactory { function getPair(address,address) external view returns (address); }

contract KydosToken {
  string public name; string public symbol; uint8 public constant decimals = 18;
  uint256 public totalSupply; address public immutable factory; address public curve;
  mapping(address => uint256) public balanceOf;
  mapping(address => mapping(address => uint256)) public allowance;
  event Transfer(address indexed from,address indexed to,uint256 value);
  event Approval(address indexed owner,address indexed spender,uint256 value);
  constructor(string memory n,string memory s){ name=n; symbol=s; factory=msg.sender; }
  function initialize(address c,uint256 supply) external { require(msg.sender==factory && curve==address(0)); curve=c; totalSupply=supply; balanceOf[c]=supply; emit Transfer(address(0),c,supply); }
  function approve(address s,uint256 v) external returns(bool){ allowance[msg.sender][s]=v; emit Approval(msg.sender,s,v); return true; }
  function transfer(address to,uint256 v) external returns(bool){ _move(msg.sender,to,v); return true; }
  function transferFrom(address f,address to,uint256 v) external returns(bool){ uint256 a=allowance[f][msg.sender]; if(a!=type(uint256).max){ require(a>=v); allowance[f][msg.sender]=a-v; } _move(f,to,v); return true; }
  function _move(address f,address to,uint256 v) internal { require(to!=address(0) && balanceOf[f]>=v); unchecked { balanceOf[f]-=v; balanceOf[to]+=v; } emit Transfer(f,to,v); }
}

contract KydosCurve {
  uint256 public constant TOTAL_SUPPLY=1_000_000_000 ether;
  uint256 public constant VIRTUAL_ETH=30 ether;
  uint256 public constant VIRTUAL_TOKENS=1_073_000_000 ether;
  uint256 public constant GRADUATION_TARGET=85 ether;
  uint256 private constant K=VIRTUAL_ETH*VIRTUAL_TOKENS;
  KydosToken public token; address public router; address public weth; address public creator;
  uint256 public reserve; uint256 public tokensSold; bool public graduated; bool private entered;
  event Buy(address indexed trader,uint256 ethIn,uint256 tokensOut,uint256 newReserve);
  event Sell(address indexed trader,uint256 tokensIn,uint256 ethOut,uint256 newReserve);
  event Graduated(address indexed pair,uint256 ethLiquidity,uint256 tokenLiquidity);
  modifier lock(){ require(!entered); entered=true; _; entered=false; }
  function initialize(address t,address r,address w,address c) external { require(address(token)==address(0) && t!=address(0)); token=KydosToken(t); router=r; weth=w; creator=c; }
  function quoteBuy(uint256 ethIn) public view returns(uint256){ uint256 h=VIRTUAL_ETH+reserve; uint256 t=VIRTUAL_TOKENS-tokensSold; uint256 out=t-(K/(h+ethIn)); uint256 available=TOTAL_SUPPLY-tokensSold; return out>available?available:out; }
  function quoteSell(uint256 tokenIn) public view returns(uint256){ uint256 h=VIRTUAL_ETH+reserve; uint256 t=VIRTUAL_TOKENS-tokensSold; uint256 out=h-(K/(t+tokenIn)); return out>reserve?reserve:out; }
  function currentPrice() external view returns(uint256){ return ((VIRTUAL_ETH+reserve)*1 ether)/(VIRTUAL_TOKENS-tokensSold); }
  function buy(uint256 minTokens) external payable lock { require(!graduated && msg.value>0); uint256 out=quoteBuy(msg.value); require(out>=minTokens && out>0); reserve+=msg.value; tokensSold+=out; require(token.transfer(msg.sender,out)); emit Buy(msg.sender,msg.value,out,reserve); }
  function sell(uint256 amount,uint256 minEth) external lock { require(!graduated && amount>0 && amount<=tokensSold); uint256 out=quoteSell(amount); require(out>=minEth && out>0); require(token.transferFrom(msg.sender,address(this),amount)); tokensSold-=amount; reserve-=out; (bool ok,)=payable(msg.sender).call{value:out}(""); require(ok); emit Sell(msg.sender,amount,out,reserve); }
  function graduate() external lock returns(address pair){ require(!graduated && reserve>=GRADUATION_TARGET); graduated=true; uint256 ethAmount=reserve; uint256 tokenAmount=token.balanceOf(address(this)); reserve=0; token.approve(router,tokenAmount); IRouter(router).addLiquidityETH{value:ethAmount}(address(token),tokenAmount,0,0,address(0x000000000000000000000000000000000000dEaD),block.timestamp+1200); pair=IUniFactory(IRouter(router).factory()).getPair(address(token),weth); require(pair!=address(0)); emit Graduated(pair,ethAmount,tokenAmount); }
  receive() external payable { require(msg.sender==router); }
}

contract KydosFactory {
  address public immutable router; address public immutable weth; address public immutable curveImplementation;
  event TokenCreated(address indexed creator,address indexed token,address indexed curve,string name,string symbol);
  constructor(address r,address w){ require(r!=address(0)&&w!=address(0)); router=r; weth=w; curveImplementation=address(new KydosCurve()); }
  function createToken(string calldata n,string calldata s) external returns(address tokenAddress,address curveAddress){
    require(bytes(n).length>0 && bytes(s).length>0 && bytes(s).length<=8);
    KydosToken t=new KydosToken(n,s); curveAddress=_clone(curveImplementation); KydosCurve(payable(curveAddress)).initialize(address(t),router,weth,msg.sender); t.initialize(curveAddress,1_000_000_000 ether); tokenAddress=address(t); emit TokenCreated(msg.sender,tokenAddress,curveAddress,n,s);
  }
  function _clone(address implementation) internal returns(address instance){ assembly { mstore(0x00,or(shr(0xe8,shl(0x60,implementation)),0x3d602d80600a3d3981f3)) mstore(0x20,or(shl(0x78,implementation),0x5af43d82803e903d91602b57fd5bf3)) instance:=create(0,0x09,0x37) } require(instance!=address(0)); }
}`;

export function compileFactory(solc) {
  const input={language:"Solidity",sources:{"Kydos.sol":{content:KYDOS_SOURCE}},settings:{optimizer:{enabled:true,runs:200},outputSelection:{"*":{"KydosFactory":["abi","evm.bytecode.object"]}}}};
  const output=JSON.parse(solc.compile(JSON.stringify(input)));
  const errors=(output.errors||[]).filter((e)=>e.severity==="error");
  if(errors.length) throw new Error(errors.map((e)=>e.formattedMessage).join("\n"));
  return output.contracts["Kydos.sol"].KydosFactory;
}