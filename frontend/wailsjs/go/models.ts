export namespace main {
	
	export class ContextMenuStatus {
	    exists: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ContextMenuStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.exists = source["exists"];
	    }
	}
	export class ServerInfo {
	    url: string;
	    port: number;
	    localIP: string;
	    qrCode: string;
	    sharedFolder: string;
	
	    static createFrom(source: any = {}) {
	        return new ServerInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.port = source["port"];
	        this.localIP = source["localIP"];
	        this.qrCode = source["qrCode"];
	        this.sharedFolder = source["sharedFolder"];
	    }
	}

}

