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
	export class DownloadResult {
	    latestVersion: string;
	    downloadsDir: string;
	    zipPath: string;
	    shaPath: string;
	    extractedExePath: string;
	    backupExePath: string;
	
	    static createFrom(source: any = {}) {
	        return new DownloadResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.latestVersion = source["latestVersion"];
	        this.downloadsDir = source["downloadsDir"];
	        this.zipPath = source["zipPath"];
	        this.shaPath = source["shaPath"];
	        this.extractedExePath = source["extractedExePath"];
	        this.backupExePath = source["backupExePath"];
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
	export class UpdateInfo {
	    currentVersion: string;
	    latestVersion: string;
	    hasUpdate: boolean;
	    releaseURL: string;
	    notes: string;
	    zipName: string;
	    zipURL: string;
	    shaURL: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.hasUpdate = source["hasUpdate"];
	        this.releaseURL = source["releaseURL"];
	        this.notes = source["notes"];
	        this.zipName = source["zipName"];
	        this.zipURL = source["zipURL"];
	        this.shaURL = source["shaURL"];
	    }
	}

}

